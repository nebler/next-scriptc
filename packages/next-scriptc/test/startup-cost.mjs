// Indicative process-cold startup and idle process-tree RSS, using existing builds.
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
assert.equal(Number(process.versions.node.split(".")[0]), 24, "Use Node 24");
const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../../..");
const demo = path.join(root, "examples/demo");
const src = path.join(root, "packages/next-scriptc/src");
const temporary = await mkdtemp(path.join(import.meta.dirname, ".startup-"));
const manifest = JSON.parse(await readFile(path.join(demo, ".next/scriptc/manifest.json"), "utf8"));
const port = 3447;
const rounds = Number(process.env.STARTUP_ROUNDS ?? 5);
const samples = [];
let child;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function freePorts() {
  for (const candidate of [port, ...manifest.routes.map((route) => route.port)]) {
    const server = net.createServer();
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(candidate, "127.0.0.1", resolve); });
    await new Promise((resolve) => server.close(resolve));
  }
}
async function snapshot(parent) {
  const { stdout } = await exec("ps", ["-axo", "pid=,ppid=,rss=,args="]);
  const all = stdout.split("\n").map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/)).filter(Boolean)
    .map(([, pid, ppid, rss, command]) => ({ pid: Number(pid), ppid: Number(ppid), rssMiB: Number(rss) / 1024, command }));
  const owned = new Set([parent]);
  let size;
  do { size = owned.size; for (const process of all) if (owned.has(process.ppid)) owned.add(process.pid); } while (owned.size !== size);
  return all.filter((process) => owned.has(process.pid));
}
async function get() {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/api/hello", agent: false }, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("error", reject);
      response.on("end", () => {
        if (response.statusCode === 200 && body === '{"message":"Hello from next-scriptc!"}') resolve();
        else reject(new Error(`Unexpected response ${response.statusCode}: ${body}`));
      });
    });
    req.setTimeout(30_000, () => req.destroy(new Error("Request timeout")));
    req.on("error", reject);
  });
}
try {
  // Reconstruct the former supervisor/config guard without touching the checkout.
  for (const file of ["cli.mjs", "adapter.mjs"]) {
    const { stdout } = await exec("git", ["show", `9d02686:packages/next-scriptc/src/${file}`], { cwd: root });
    await writeFile(path.join(temporary, file), stdout.replaceAll(/from "\.\/(.*?)"/g, (_, name) => `from ${JSON.stringify(path.join(src, name))}`));
  }
  const original = pathToFileURL(path.join(src, "adapter.mjs")).href;
  const replacement = pathToFileURL(path.join(temporary, "adapter.mjs")).href;
  const hook = path.join(temporary, "hook.mjs");
  await writeFile(hook, `import { registerHooks } from "node:module"; registerHooks({resolve(s,c,next){ const r=next(s,c); return r.url===${JSON.stringify(original)} ? {url:${JSON.stringify(replacement)},shortCircuit:true} : r; }});`);
  for (let round = 0; round < rounds; round++) {
    const variants = ["node", "supervisor-9d02686", "in-process"];
    for (const variant of round % 2 ? variants.reverse() : variants) {
      await freePorts();
      const begin = performance.now();
      const env = { ...process.env, NEXT_SCRIPTC_BASELINE: variant === "node" ? "node" : "" };
      if (variant === "supervisor-9d02686") env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(hook).href}`;
      child = spawn(process.execPath, [variant === "supervisor-9d02686" ? path.join(temporary, "cli.mjs") : path.join(demo, "node_modules/next/dist/bin/next"), "start", "-p", String(port)], { cwd: demo, env, stdio: ["ignore", "pipe", "pipe"] });
      const state = { output: "", done: false };
      for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { state.output += chunk; });
      const exited = new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", () => { state.done = true; resolve(); }); });
      let tree = [];
      try {
        while (true) {
          assert.equal(state.done, false, state.output);
          assert.ok(performance.now() - begin < 60_000, state.output);
          try { await get(); break; } catch { await pause(2); }
        }
        const coldMs = performance.now() - begin;
        await pause(500);
        tree = await snapshot(child.pid);
        assert.equal(tree.length, variant === "node" ? 1 : variant === "in-process" ? manifest.routes.length + 1 : manifest.routes.length + 2, state.output);
        const sample = { round, variant, coldMs, rssMiB: tree.reduce((sum, process) => sum + process.rssMiB, 0), tree };
        samples.push(sample);
        console.log(JSON.stringify(sample));
      } finally {
        child.kill("SIGTERM");
        const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
        await exited;
        clearTimeout(timer);
        child = undefined;
        for (let attempt = 0; attempt < 200; attempt++) {
          const alive = tree.filter(({ pid }) => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code !== "ESRCH") throw error; return false; } });
          if (!alive.length) break;
          assert.ok(attempt < 199, `Processes survived: ${JSON.stringify(alive)}`);
          await pause(25);
        }
        await freePorts();
      }
    }
  }
  await writeFile(path.join(import.meta.dirname, "startup-cost-results.json"), JSON.stringify({ date: new Date().toISOString(), node: process.version, platform: process.platform, loadavg: os.loadavg(), rounds, nativeBuildId: manifest.buildId, nodeBuildId: (await readFile(path.join(demo, ".next-node/BUILD_ID"), "utf8")).trim(), samples, portsFree: true }, null, 2) + "\n");
} finally {
  child?.kill("SIGKILL");
  await rm(temporary, { recursive: true, force: true });
}
