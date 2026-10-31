// Run after native + Node production builds, or omit --skip-build to build both.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { cpus } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { callNative } from "../../../packages/next-scriptc/src/functions/client.mjs";
import { extractFunctions } from "../../../packages/next-scriptc/src/functions/extract.mjs";
import { revenue } from "../lib/revenue.ts";
import { profile } from "./function-profile.ts";
import { build, demo, report, start, stop, wait } from "../test/function-harness.mjs";

const count = Number(process.env.FUNCTION_BENCH_CALLS ?? 1000);
const pageCalls = Number(process.env.FUNCTION_BENCH_PAGES ?? 200);
const warmup = Number(process.env.FUNCTION_BENCH_WARMUP ?? 50);
const port = Number(process.env.FUNCTION_TEST_PORT ?? 3461);
const sizes = [5000, 15000, 50000, 200000];
const destination = process.argv.find((arg) => arg.startsWith("--output="))?.slice(9);
const require = createRequire(path.resolve(demo, "../../packages/next-scriptc/package.json"));
const compiler = path.resolve(path.dirname(require.resolve("scriptc/package.json")), require("scriptc/package.json").bin.scriptc);
const summary = (times) => {
  times.sort((a, b) => a - b);
  return { calls: times.length, p50: times[Math.floor(times.length * .5)], p99: times[Math.floor(times.length * .99)] };
};
async function time(call, calls = pageCalls) {
  for (let i = 0; i < warmup; i++) await call();
  const times = [];
  for (let i = 0; i < calls; i++) { const begin = performance.now(); await call(); times.push(performance.now() - begin); }
  return summary(times);
}
async function samples(call) {
  for (let i = 0; i < warmup; i++) await call();
  const values = [];
  for (let i = 0; i < pageCalls; i++) values.push(await call());
  return Object.fromEntries(Object.keys(values[0]).map((key) => [key, summary(values.map((value) => value[key]))]));
}
const results = { node: process.version, cpu: cpus()[0].model, scriptc: require("scriptc/package.json").version,
  commit: process.env.BENCH_COMMIT ?? (await promisify(execFile)("git", ["rev-parse", "HEAD"])).stdout.trim(),
  sourceSha256: createHash("sha256").update(await readFile(path.join(demo, "lib/revenue.ts"))).digest("hex"),
  platform: `${process.platform}/${process.arch}`, warmup, method: "sequential C=1; ms; full page bodies consumed; alternating runtime order by size; server/load affinity supplied by harness", sizes: {} };
async function checkpoint(phase) {
  results.phase = phase;
  if (destination) await writeFile(destination, JSON.stringify(results, null, 2) + "\n");
}
if (!process.argv.includes("--skip-build")) { await build(false); await build(true); }
const states = [];
try {
  states.push(await start(port));
  states.push(await start(port + 1, true));
  const manifest = JSON.parse(await readFile(path.join(demo, ".next/scriptc-functions/manifest.json"), "utf8"));
  async function id(file, name) {
    const source = path.join(demo, file);
    return extractFunctions(await readFile(source, "utf8"), source).functions.find((fn) => fn.name === name).id;
  }
  const nativePort = manifest.processes[0].port;
  const echoId = await id("lib/native-example.ts", "echo");
  const revenueId = await id("lib/revenue.ts", "revenue");
  results.callOverhead = await time(async () => assert.equal(await callNative(nativePort, echoId, ["hello"]), "hello"), count);
  for (const [index, size] of sizes.entries()) {
    const row = results.sizes[size] = {};
    for (const baseline of index % 2 ? [true, false] : [false, true]) {
      row[baseline ? "nodePage" : "nativePage"] = await time(async () => {
        const value = await report(port + Number(baseline), `?size=${size}`);
        assert.equal(JSON.parse(value.value).events, size);
      });
    }
    const args = ["2026-01-01", "2026-01-31", size, false];
    row.nativeCall = await time(async () => assert.equal((await callNative(nativePort, revenueId, args)).events, size));
    row.nativeBody = await samples(async () => (await callNative(nativePort, revenueId, [...args.slice(0, 3), true])).timings);
    row.nodeProfile = await samples(() => profile(size));
    await checkpoint(`page-${size}`);
  }
} finally { await Promise.all(states.map(stop)); }

// A control build renders the identical page/results with compute precomputed.
// No benchmark switch or cache is added to the production app. Use a separate
// output so subsequent --skip-build parity tests still use the real baseline.
const sourceFile = path.join(demo, "lib/revenue.ts");
const configFile = path.join(demo, "next.config.ts");
const sourceText = await readFile(sourceFile, "utf8");
const configText = await readFile(configFile, "utf8");
const tsconfigFile = path.join(demo, "tsconfig.json");
const tsconfigText = await readFile(tsconfigFile, "utf8");
let control;
try {
  const values = Object.fromEntries(await Promise.all(sizes.map(async (size) => [size, await revenue("2026-01-01", "2026-01-31", size, false)])));
  await writeFile(sourceFile, `type Result = { from: string; to: string; events: number; revenueCents: number; daily: { day: string; region: string; revenueCents: number; units: number; events: number }[]; timings: { parseMs: number; aggregateMs: number } | null };
const values: Record<string, Result> = ${JSON.stringify(values)};
export async function revenue(_from: string, _to: string, size: number, _profile: boolean) { return values[String(size)]; }
`);
  assert.ok(configText.includes('".next-node"'));
  await writeFile(configFile, configText.replace('".next-node"', '".next-render"'));
  await build(true);
  control = await start(port + 1, true);
  for (const size of sizes) results.sizes[size].renderControl = await time(async () => {
    const value = await report(port + 1, `?size=${size}`);
    assert.deepEqual(JSON.parse(value.value), values[size]);
  });
} finally {
  try { if (control) await stop(control); }
  finally {
    await writeFile(sourceFile, sourceText);
    await writeFile(configFile, configText);
    await writeFile(tsconfigFile, tsconfigText);
  }
}

// A separate probe compares bulk-descriptor validation, legacy reflection and replacer/stringify in-process.
// It imports the very same source/result serializer and uses the production HTTP handler.
const output = path.join(demo, ".next/cache/function-profile");
await mkdir(output, { recursive: true });
await writeFile(path.join(output, "package.json"), '{"type":"module"}\n');
await writeFile(path.join(output, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true, target: "esnext", module: "nodenext", allowImportingTsExtensions: true, noEmit: true } }));
const entry = path.join(output, "entry.ts");
await writeFile(entry, `import { serveFunctions } from ${JSON.stringify(path.resolve(demo, "../../packages/next-scriptc/src/functions/serve.ts"))};
import { profile } from ${JSON.stringify(path.join(demo, "bench/function-profile.ts"))};
serveFunctions(async (_id: string, body: string): Promise<unknown> => { const args = JSON.parse(body) as [number]; return profile(args[0]); });\n`);
await promisify(execFile)(compiler, ["build", entry, "-o", path.join(output, "profile"), "--optimization", "release", "--strip", "--no-keep-llvm", "--node-islands=off"], { env: { ...process.env, SCRIPTC_CHECKER_SERVER: "0" } });
const child = spawn(process.env.FUNCTION_SERVER_CPU ? "taskset" : path.join(output, "profile"), process.env.FUNCTION_SERVER_CPU ? ["-c", process.env.FUNCTION_SERVER_CPU, path.join(output, "profile")] : [], { env: { ...process.env, PORT: String(port), NEXT_SCRIPTC_PARENT: String(process.pid) }, stdio: ["ignore", "pipe", "pipe"] });
const state = { child, output: "", exit: new Promise((resolve) => child.once("close", resolve)) };
for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { state.output += chunk; });
try {
  await wait(state, /listening on/);
  for (const size of sizes) results.sizes[size].nativeProfile = await samples(() => callNative(port, "profile", [size]));
} finally { await stop(state); }
await checkpoint("complete");
const json = JSON.stringify(results, null, 2) + "\n";
if (destination) await writeFile(destination, json);
console.log(json);
