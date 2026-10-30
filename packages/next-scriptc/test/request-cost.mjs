// Indicative direct-native hello cost. Run with Node 24 on a quiet host for useful numbers.
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
assert.equal(Number(process.versions.node.split(".")[0]), 24, "Use Node 24");
const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../../..");
const shim = path.join(root, "packages/next-scriptc/shim");
const temporary = await mkdtemp(path.join(import.meta.dirname, ".cost-"));
const rounds = Number(process.env.COST_ROUNDS ?? 5);
const count = Number(process.env.COST_COUNT ?? 1500);
const results = [];
const parentLease = process.env.COST_PARENT_LEASE === "1";
const variants = ["5536d9f", "9d02686", "working"];
let child;
try {
  await writeFile(path.join(temporary, "tsconfig.json"), JSON.stringify({
    extends: path.join(root, "examples/demo/tsconfig.json"),
    compilerOptions: { types: ["node"], typeRoots: [path.join(root, "examples/demo/node_modules/@types")] },
  }));
  for (const variant of variants) {
    const source = variant === "working" ? await readFile(path.join(shim, "serve.ts"), "utf8") :
      (await exec("git", ["show", `${variant}:packages/next-scriptc/shim/serve.ts`], { cwd: root })).stdout;
    let nextServer = path.join(shim, "next-server.ts");
    if (variant === "9d02686") {
      nextServer = path.join(temporary, "next-server-review1.ts");
      await writeFile(nextServer, (await exec("git", ["show", "9d02686:packages/next-scriptc/shim/next-server.ts"], { cwd: root })).stdout);
    }
    const file = path.join(temporary, `${variant}.ts`);
    await writeFile(file, source.replace('"./next-server.ts"', JSON.stringify(nextServer)) +
      `\nimport { GET } from ${JSON.stringify(path.join(root, 'examples/demo/app/api/hello/route.ts'))};\nserve({ GET, HEAD: undefined, POST: undefined, PUT: undefined, PATCH: undefined, DELETE: undefined, OPTIONS: undefined }, { pattern: "/api/hello" });\n`);
    await exec(path.join(root, "packages/next-scriptc/node_modules/.bin/scriptc"), ["build", file, "-o", path.join(temporary, variant), "--no-keep-llvm"], { env: { ...process.env, SCRIPTC_CHECKER_SERVER: "0" }, timeout: 120_000 });
  }
  for (let round = 0; round < rounds; round++) {
    for (const variant of round % 2 ? [...variants].reverse() : variants) {
      child = spawn(path.join(temporary, variant), [], { env: { ...process.env, PORT: "0", NEXT_SCRIPTC_PARENT: parentLease ? "1" : "" }, stdio: ["pipe", "pipe", "inherit"] });
      const exited = new Promise((resolve) => child.once("exit", resolve));
      const port = await new Promise((resolve, reject) => {
        let output = "";
        const timer = setTimeout(() => reject(new Error("Readiness timeout")), 30_000);
        child.once("error", reject);
        child.stdout.on("data", (chunk) => {
          output += chunk;
          const match = output.match(/listening on 127\.0\.0\.1:(\d+)/);
          if (match) { clearTimeout(timer); resolve(Number(match[1])); }
        });
      });
      const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
      const samples = [];
      try {
        for (let i = 0; i < count + 300; i++) {
          const begin = performance.now();
          await new Promise((resolve, reject) => {
            const req = http.get({ host: "127.0.0.1", port, path: "/api/hello", agent }, (response) => {
              let body = "";
              response.on("data", (chunk) => { body += chunk; });
              response.on("end", () => {
                try {
                  assert.equal(response.statusCode, 200);
                  assert.equal(body, '{"message":"Hello from next-scriptc!"}');
                  resolve();
                } catch (error) { reject(error); }
              });
              response.on("error", reject);
            });
            req.setTimeout(10_000, () => req.destroy(new Error("Request timeout")));
            req.on("error", reject);
          });
          if (i >= 300) samples.push(performance.now() - begin);
        }
        const sorted = [...samples].sort((a, b) => a - b);
        const result = { round, variant, count, meanMs: samples.reduce((a, b) => a + b) / count,
          p50Ms: sorted[Math.ceil(count * .5) - 1], p99Ms: sorted[Math.ceil(count * .99) - 1] };
        results.push(result);
        console.log(JSON.stringify(result));
      } finally {
        agent.destroy();
        child.kill("SIGTERM");
        const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
        await exited;
        clearTimeout(timer);
        child = undefined;
      }
    }
  }
  await writeFile(path.join(import.meta.dirname, parentLease ? "request-cost-managed-results.json" : "request-cost-results.json"), JSON.stringify({ date: new Date().toISOString(), node: process.version, platform: process.platform, loadavg: os.loadavg(), parentLease, count, warmup: 300, rounds, results }, null, 2) + "\n");
} finally {
  child?.kill("SIGKILL");
  await rm(temporary, { recursive: true, force: true });
}
