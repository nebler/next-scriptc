// Two production builds from this checkout. Loopback/SRH observations only.
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import path from "node:path";
import os from "node:os";
import { emulator } from "./emulator.mjs";
import { seed } from "./seed.mjs";
import { ioServerEnv } from "./fixtures.mjs";
import { measureIo } from "../vercel/io-client.mjs";
const root = path.resolve(import.meta.dirname, "../../../.."), demo = path.join(root, "examples/demo");
const output = path.resolve(root, process.env.IO_OUTPUT ?? "research/benchmarks/realistic-io-local.json");
if (existsSync(output)) throw new Error("Retain previous output and set IO_OUTPUT to a new path");
const sourceFiles = execFileSync("git", ["ls-files", "-z"], { cwd: root }).toString().split("\0").filter((file) => file && !file.startsWith("research/benchmarks/"));
async function sourceHash() {
  const hash = createHash("sha256");
  for (const file of sourceFiles) hash.update(file).update("\0").update(await readFile(path.join(root, file)));
  return hash.digest("hex");
}
const initialHash = await sourceHash();
const data = { sourceSha256: initialHash, label: "local production/SRH; not hosted", startedAt: new Date().toISOString(), status: "running",
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()),
  environment: { node: process.version, platform: process.platform, arch: process.arch, cpus: os.cpus().length, model: os.cpus()[0]?.model }, deployments: [] };
let redis, state;
async function stop() {
  if (!state) return;
  if (!state.child.pid) { await state.done; state = null; return; }
  try { process.kill(-state.child.pid, "SIGTERM"); } catch (e) { if (e.code !== "ESRCH") throw e; }
  const timer = setTimeout(() => { try { process.kill(-state.child.pid, "SIGKILL"); } catch {} }, 10000);
  await state.done; clearTimeout(timer); state = null;
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop().then(() => redis?.stop()).finally(() => process.exit(1)));
try {
  redis = await emulator();
  for (const variant of ["node", "native"]) {
    const env = { ...process.env, ...redis.env, ...ioServerEnv, DEMO_REDIS_PREFIX: "next-scriptc:io:local",
      NEXT_SCRIPTC_BASELINE: variant === "node" ? "node" : "", NEXT_SCRIPTC_DEMO_GROUPS: "vercel", SCRIPTC_CHECKER_SERVER: "0" };
    if (await sourceHash() !== initialHash) throw new Error("Source changed between variants");
    console.log(`Building local ${variant}`);
    const build = spawn("pnpm", ["--filter", "demo", "build"], { cwd: root, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let buildOutput = "";
    for (const stream of [build.stdout, build.stderr]) stream.on("data", (chunk) => { buildOutput += chunk; });
    const buildDone = new Promise((resolve, reject) => { build.once("error", reject); build.once("close", resolve); });
    state = { child: build, done: buildDone };
    const code = await buildDone;
    state = null;
    await writeFile(output.replace(/\.json$/, `-${variant}-build.txt`), buildOutput);
    if (code !== 0) throw new Error(`${variant} build failed; see saved log`);
    const server = createServer(); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port; await new Promise((resolve) => server.close(resolve));
    const command = variant === "node" ? "exec" : "start";
    const args = variant === "node" ? ["--filter", "demo", command, "next", "start", "-p", String(port)] : ["--filter", "demo", command, "-p", String(port)];
    const start = performance.now(), child = spawn("pnpm", args, { cwd: root, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let logs = "", exited = false;
    child.once("error", (error) => { logs += error.message; exited = true; });
    const done = new Promise((resolve) => child.once("close", (...value) => { exited = true; resolve(value); }));
    state = { child, done };
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { logs += chunk; });
    for (let i = 0; !/Ready in/.test(logs); i++) {
      if (exited || i >= 1200) throw new Error(`${variant} startup failed`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const readyMs = performance.now() - start;
    const result = await measureIo({ variant, url: `http://127.0.0.1:${port}` }, { reset: () => seed(env) });
    data.deployments.push({ ...result, readyMs });
    await writeFile(output, JSON.stringify(data, null, 2) + "\n");
    await stop();
    await writeFile(output.replace(/\.json$/, `-${variant}-server.txt`), logs);
    console.log(`${variant}: ${result.status}, ${result.requestsIssued} requests`);
    if (result.status === "failed") throw new Error(result.error);
  }
  if (await sourceHash() !== initialHash) throw new Error("Source changed during measurement");
  data.status = data.deployments.every((r) => r.status === "complete") ? "complete" : "incomplete";
} catch (error) { data.status = "failed"; data.error = error.message; process.exitCode = 1; }
finally {
  await stop(); await redis?.stop();
  data.finishedAt = new Date().toISOString();
  await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(data, null, 2) + "\n");
  console.log(`Results: ${output}; ${data.status}`);
}
