import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { Agent, request } from "node:http";
import { cpus, tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { callNative } from "../../../packages/next-scriptc/src/functions/client.mjs";
import { extractFunctions } from "../../../packages/next-scriptc/src/functions/extract.mjs";
import { build, demo, report, start, stop } from "../test/function-harness.mjs";

const count = Number(process.env.FUNCTION_BENCH_CALLS ?? "1000");
const port = Number(process.env.FUNCTION_TEST_PORT ?? "3461");
const warmup = 100;
const compilerRequire = createRequire(path.resolve(demo, "../../packages/next-scriptc/package.json"));
const compiler = path.resolve(path.dirname(compilerRequire.resolve("scriptc/package.json")), compilerRequire("scriptc/package.json").bin.scriptc);
const summary = (times) => {
  times.sort((a, b) => a - b);
  return { calls: times.length, p50: times[Math.floor(times.length * .5)], p99: times[Math.floor(times.length * .99)] };
};
async function time(call, calls = count) {
  for (let i = 0; i < warmup; i++) await call();
  const times = [];
  for (let i = 0; i < calls; i++) { const begin = performance.now(); await call(); times.push(performance.now() - begin); }
  return summary(times);
}
const results = { node: process.version, cpu: cpus()[0].model, scriptc: compilerRequire("scriptc/package.json").version, pageSourceSha256: createHash("sha256").update(await readFile(path.join(demo, "app/reports/page.tsx"))).digest("hex"), platform: `${process.platform}/${process.arch}`, warmup, method: "sequential C=1, ms, full response consumed" };
for (const baseline of [false, true]) {
  if (!process.argv.includes("--skip-build")) await build(baseline);
  const pagePort = port + Number(baseline);
  const state = await start(pagePort, baseline);
  try {
    results[baseline ? "nodePage" : "nativePage"] = await time(async () => {
      const value = await report(pagePort);
      assert.equal(JSON.parse(value.value).events, 5000);
    }, Math.min(count, 500));
    if (!baseline) {
      const source = path.join(demo, "lib/native-example.ts");
      const fn = extractFunctions(await readFile(source, "utf8"), source).functions.find((fn) => fn.name === "echo");
      const manifest = JSON.parse(await readFile(path.join(demo, ".next/scriptc-functions/manifest.json"), "utf8"));
      results.actualStubHTTP = await time(async () => assert.equal(await callNative(manifest.processes[0].port, fn.id, ["hello"]), "hello"));
    }
  } finally { await stop(state); }
}

// Same production request handler and validator; only its listen address changes.
const output = path.join(demo, ".next/cache/function-transport");
await mkdir(output, { recursive: true });
await writeFile(path.join(output, "package.json"), '{"type":"module"}\n');
const serve = path.resolve(demo, "../../packages/next-scriptc/src/functions/serve.ts");
const json = path.resolve(path.dirname(serve), "json.ts");
let text = (await readFile(serve, "utf8")).replace('"./json.ts"', JSON.stringify(json));
const listen = /  server\.listen\(port, "127\.0\.0\.1", \(\) => \{[\s\S]*?\n  \}\);/;
assert.match(text, listen);
text = text.replace(listen, `  const ready = () => console.log("transport-ready");
  if (process.env.SOCKET) server.listen(process.env.SOCKET, ready);
  else server.listen(port, "127.0.0.1", ready);`);
text += '\nserveFunctions(async (_id: string, body: string): Promise<unknown> => { const args = JSON.parse(body) as [string]; return args[0]; });\n';
await writeFile(path.join(output, "entry.ts"), text);
await writeFile(path.join(output, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true, target: "esnext", module: "nodenext", allowImportingTsExtensions: true, noEmit: true } }));
await promisify(execFile)(compiler, ["build", path.join(output, "entry.ts"), "-o", path.join(output, "transport"), "--strip", "--no-keep-llvm", "--node-islands=off"], { env: { ...process.env, SCRIPTC_CHECKER_SERVER: "0" } });
const socket = path.join(tmpdir(), `sc-functions-${process.pid}.sock`);
for (const unix of [false, true]) {
  const child = spawn(path.join(output, "transport"), [], { env: { ...process.env, PORT: String(port), SOCKET: unix ? socket : "" }, stdio: ["ignore", "pipe", "inherit"] });
  const exited = new Promise((resolve) => child.once("close", resolve));
  const agent = new Agent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 8 });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Transport readiness timeout")), 30_000);
      child.stdout.on("data", (chunk) => { if (String(chunk).includes("transport-ready")) { clearTimeout(timer); resolve(); } });
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Transport exited ${code}`)); });
    });
    results[unix ? "probeUDS" : "probeHTTP"] = await time(() => new Promise((resolve, reject) => {
      const body = '["hello"]';
      const req = request({ ...(unix ? { socketPath: socket } : { hostname: "127.0.0.1", port }), agent, path: "/echo", method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } }, (res) => {
        let result = ""; res.setEncoding("utf8");
        res.on("data", (chunk) => { result += chunk; }); res.on("error", reject);
        res.on("end", () => { try { assert.equal(JSON.parse(result), "hello"); resolve(); } catch (error) { reject(error); } });
      });
      req.on("error", reject); req.end(body);
    }));
  } finally { agent.destroy(); child.kill("SIGTERM"); await exited; await rm(socket, { force: true }); }
}
console.log(JSON.stringify(results, null, 2));
