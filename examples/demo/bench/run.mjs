import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { routes, profiles, isolation, serverEnv } from "./config.mjs";
import { request, digest } from "./load.mjs";
import { exec, start, ready, stop, finish, census, measure, portsFree, cleanup, signal, accounting } from "./processes.mjs";
import { threadsBenchmark } from "./threads.mjs";
import { renderReport, definitions, limitations } from "./report.mjs";

const { values } = parseArgs({ options: { profile: { type: "string", default: "full" },
  output: { type: "string" }, reverse: { type: "boolean", default: false }, "skip-threads": { type: "boolean", default: false } } });
const profile = profiles[values.profile];
if (!profile) throw new Error("--profile must be full or quick");
if (!process.version.startsWith("v24.")) throw new Error(`Use Node 24.x; got ${process.version}`);
if (process.env.NODE_OPTIONS?.trim()) throw new Error("Unset NODE_OPTIONS so neither Node baseline inherits hidden runtime tuning");
const root = path.resolve(import.meta.dirname, "../../..");
const demo = path.join(root, "examples/demo");
const require = createRequire(path.join(demo, "package.json"));
const compilerRequire = createRequire(path.join(root, "packages/next-scriptc/package.json"));
const next = require.resolve("next/dist/bin/next");
const cli = path.join(root, "packages/next-scriptc/src/cli.mjs");
const manifest = JSON.parse(await readFile(path.join(demo, ".next/scriptc/manifest.json"), "utf8"));
assert.equal(manifest.buildId, (await readFile(path.join(demo, ".next/BUILD_ID"), "utf8")).trim());
await readFile(path.join(demo, ".next-node/BUILD_ID"));
const active = routes.filter((route) => route.enabled !== false);
assert.ok(active.length, "Enable at least one workload in bench/config.mjs");
for (const route of active) {
  const index = manifest.routes.findIndex((item) => item.pattern === route.pattern);
  assert.ok(index >= 0, `Configured route absent from manifest: ${route.pattern}`);
  route.entry = path.join(demo, ".next/scriptc", `entry-${index}.ts`);
  route.binary = path.join(demo, ".next/scriptc", manifest.routes[index].binary);
  route.port = manifest.routes[index].port;
}

let serverCpus, loadCpus, threadCpus, allowed;
if (process.platform === "linux") {
  const status = await readFile("/proc/self/status", "utf8");
  allowed = status.match(/^Cpus_allowed_list:\s*(.*)$/m)[1].split(",").flatMap((range) => {
    const [lo, hi = lo] = range.split("-").map(Number);
    return Array.from({ length: hi - lo + 1 }, (_, index) => lo + index);
  });
  if (allowed.length < 4) throw new Error("Linux benchmark needs four allowed CPUs for disjoint server/load affinity");
  serverCpus = allowed.slice(0, 2).join(",");
  loadCpus = allowed.slice(2, 4).join(",");
  threadCpus = allowed.slice(0, 4).join(",");
  // Keep orchestration/sampling away from the server CPUs too.
  await exec("taskset", ["-pc", loadCpus, String(process.pid)]);
}
const git = async (...args) => (await exec("git", args, { cwd: root })).stdout.trim();
async function sourceSnapshot() {
  const files = ["pnpm-lock.yaml", "examples/demo/package.json", "examples/demo/next.config.ts",
    "packages/next-scriptc/shim/serve.ts", "packages/next-scriptc/shim/next-server.ts"];
  async function walk(relative) {
    for (const item of await readdir(path.join(root, relative), { withFileTypes: true })) {
      if (item.name.startsWith(".")) continue;
      const file = `${relative}/${item.name}`;
      if (item.isDirectory()) await walk(file);
      else if (item.isFile()) files.push(file);
    }
  }
  for (const directory of ["examples/demo/app", "examples/demo/bench", "packages/next-scriptc/src"]) await walk(directory);
  const snapshot = [];
  for (const file of files.sort()) {
    // next-server.ts does not exist on the pre-integration adapter.
    try { snapshot.push({ file, sha256: digest(await readFile(path.join(root, file))) }); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return snapshot;
}
const stamp = new Date().toISOString().replaceAll(":", "-");
const output = path.resolve(values.output ?? path.join(root, "research/benchmarks", `${stamp}-${values.profile}`));
const data = {
  schemaVersion: 1, status: "running", label: values.profile === "quick" || process.platform !== "linux"
    ? "INDICATIVE ONLY: developer machine / reduced repetitions; not publishable performance evidence"
    : "Controlled sandbox candidate: review limitations and environmental noise before publication",
  startedAt: new Date().toISOString(), profile: { name: values.profile, ...profile, reverse: values.reverse, skipThreads: values["skip-threads"] },
  environment: { node: process.version, nodeExecutable: process.execPath, scriptc: compilerRequire("scriptc/package.json").version,
    next: require("next/package.json").version, commit: process.env.BENCH_COMMIT ?? await git("rev-parse", "HEAD"),
    archiveSha256: process.env.BENCH_ARCHIVE_SHA256,
    dirty: process.env.BENCH_COMMIT ? "HEAD archive; no working-tree overlay" : await git("status", "--porcelain"), platform: os.platform(), release: os.release(), arch: os.arch(),
    cpuModel: os.cpus()[allowed?.[0] ?? 0]?.model, vcpus: allowed?.length ?? os.availableParallelism(), logicalCpuCount: os.cpus().length, memoryBytes: os.totalmem(),
    loadAverageStart: os.loadavg(), allowedCpus: allowed, affinity: { serverCpus, loadCpus, threadCpus },
    osRelease: process.platform === "linux" ? await readFile("/etc/os-release", "utf8") : undefined,
    cpuAccounting: process.platform === "linux" ? "/proc/PID/stat utime+stime (CLK_TCK)" : "ps TIME user+system; centisecond resolution",
    accounting,
    publicFixtureEnvironment: serverEnv,
    nodePrerenderedPaths: Object.keys(JSON.parse(await readFile(path.join(demo, ".next-node/prerender-manifest.json"), "utf8")).routes),
    nativeBuildId: manifest.buildId, nodeBuildId: (await readFile(path.join(demo, ".next-node/BUILD_ID"), "utf8")).trim() },
  workloads: routes,
  isolation, definitions, limitations, artifacts: [], rows: [],
  sourceSnapshot: await sourceSnapshot(),
};
// Hash source and native artifacts so a dirty/local run is still identifiable.
for (const [index, route] of manifest.routes.entries()) data.artifacts.push({ pattern: route.pattern,
  sourceSha256: digest(await readFile(route.source)), entrySha256: digest(await readFile(path.join(demo, ".next/scriptc", `entry-${index}.ts`))),
  binarySha256: digest(await readFile(path.join(demo, ".next/scriptc", route.binary))) });
const fingerprints = new Map();
function validate(route, response) {
  const hash = digest(response.body);
  if (fingerprints.has(route.id)) assert.equal(hash, fingerprints.get(route.id), `Response parity failed: ${route.id}`);
  else fingerprints.set(route.id, hash);
  return hash;
}
function record(row) { data.rows.push(row); }
const nextPort = 3417;
const allPorts = [nextPort, ...manifest.routes.map((route) => route.port)];
function launch(scope, runtime, route) {
  if (scope === "direct") return start(runtime === "node" ? process.execPath : route.binary,
    runtime === "node" ? [route.entry] : [], { cwd: demo, cpus: serverCpus, role: `${runtime}-route`, env: { ...serverEnv, PORT: String(route.port) } });
  return start(process.execPath, [runtime === "node" ? next : cli, "start", "-p", String(nextPort), "-H", "127.0.0.1"],
    { cwd: demo, cpus: serverCpus, role: runtime === "node" ? "next-server" : "adapter-supervisor", env: { ...serverEnv, NEXT_SCRIPTC_BASELINE: runtime === "node" ? "node" : "" } });
}
function load(base, spec, options) {
  const { entry, binary, ...wire } = spec;
  return finish(start(process.execPath, [path.join(demo, "bench/load.mjs"), JSON.stringify({ base, spec: wire, ...options })],
    { cwd: demo, cpus: loadCpus }));
}
async function cold(scope, runtime, route, repeat) {
  await portsFree(allPorts);
  const proc = launch(scope, runtime, route);
  try {
    const response = await ready(proc, `http://127.0.0.1:${scope === "direct" ? route.port : nextPort}`, route);
    validate(route, response);
    record({ metric: "cold-start", scope, runtime, route: route.id, category: route.category, repeat, ms: response.coldMs });
  } finally { await stop(proc); await portsFree(allPorts); }
}
async function steady(scope, runtime, selected) {
  await portsFree(allPorts);
  const proc = launch(scope, runtime, selected[0]);
  const base = `http://127.0.0.1:${scope === "direct" ? selected[0].port : nextPort}`;
  try {
    validate(selected[0], await ready(proc, base, selected[0]));
    // Readiness itself executes one request. "Idle" is after that request and a
    // fixed quiet interval, never a misleading claim of pre-initialization RSS.
    await delay(profile.idleMs, undefined, { signal });
    record({ metric: "memory-idle", scope, runtime, initializedBy: selected[0].id,
      memory: await census(proc) });
    for (const route of selected) {
      const hash = validate(route, await request(base, route));
      const spec = { ...route, digest: hash };
      console.log(`${scope}/${runtime}/${route.id}: warmup + CPU + concurrency ${profile.concurrency.join(",")}`);
      await load(base, spec, { durationMs: profile.warmupMs });
      for (let repeat = 0; repeat < profile.repeats; repeat++) {
        const count = values.profile === "quick" ? Math.min(route.cpuRequests ?? 100, 40) : route.cpuRequests ?? 200;
        const sample = await measure(proc, () => load(base, spec, { count, concurrency: 1 }));
        assert.equal(sample.result.requests, count);
        record({ metric: "cpu-fixed-count", scope, runtime, route: route.id, category: route.category, repeat, ...sample,
          cpuMsPerRequest: sample.cpuMs / count });
      }
      for (const concurrency of profile.concurrency) {
        await load(base, spec, { durationMs: profile.warmupMs, concurrency });
        for (let repeat = 0; repeat < profile.repeats; repeat++) {
          const sample = await measure(proc, () => load(base, spec, { durationMs: profile.durationMs, concurrency }));
          record({ metric: "throughput-latency", scope, runtime, route: route.id, category: route.category,
            concurrency, repeat, ...sample });
        }
      }
    }
    if (scope === "end-to-end") {
      for (const spec of [isolation.heavy, ...isolation.probes]) await request(base, spec);
      for (let repeat = 0; repeat < profile.repeats; repeat++) {
        const idle = await load(base, {}, { probes: isolation.probes, durationMs: profile.isolationMs });
        record({ metric: "isolation-idle", scope, runtime, repeat, result: idle });
        const result = await load(base, {}, { probes: isolation.probes, heavy: isolation.heavy, durationMs: profile.isolationMs });
        record({ metric: "isolation-loaded", scope, runtime, heavyRequest: isolation.heavy, repeat, result });
      }
    }
  } finally { await stop(proc); await portsFree(allPorts); }
}

await mkdir(path.dirname(output), { recursive: true });
try {
  // Alternate order per cold repetition. No competing app servers or retained worker pools.
  for (const scope of ["direct", "end-to-end"]) {
    for (const route of active) {
      console.log(`Cold ${scope}/${route.id}: ${profile.coldRepeats} fresh starts per runtime`);
      for (let repeat = 0; repeat < profile.coldRepeats; repeat++) {
        for (const runtime of repeat % 2 ? ["native", "node"] : ["node", "native"]) await cold(scope, runtime, route, repeat);
      }
    }
  }
  // Steady-state mode blocks avoid retaining multiple Next apps in memory.
  for (const scope of ["direct", "end-to-end"]) {
    for (const runtime of values.reverse ? ["native", "node"] : ["node", "native"]) {
      if (scope === "direct") for (const route of active) await steady(scope, runtime, [route]);
      else await steady(scope, runtime, active);
    }
  }
  if (!values["skip-threads"]) await threadsBenchmark({ demo, manifest, profile, cpus: threadCpus, record });
  for (const [index, route] of manifest.routes.entries()) {
    const original = data.artifacts[index];
    assert.equal(digest(await readFile(route.source)), original.sourceSha256, `Source changed during benchmark: ${route.source}`);
    assert.equal(digest(await readFile(path.join(demo, ".next/scriptc", `entry-${index}.ts`))), original.entrySha256, "Generated entry changed during benchmark");
    assert.equal(digest(await readFile(path.join(demo, ".next/scriptc", route.binary))), original.binarySha256, "Binary changed during benchmark");
  }
  assert.equal(manifest.buildId, (await readFile(path.join(demo, ".next/BUILD_ID"), "utf8")).trim(), "Native build changed during benchmark");
  assert.equal(data.environment.nodeBuildId, (await readFile(path.join(demo, ".next-node/BUILD_ID"), "utf8")).trim(), "Node build changed during benchmark");
  assert.deepEqual(await sourceSnapshot(), data.sourceSnapshot, "Application, benchmark, adapter or lockfile changed during benchmark");
  data.status = "complete";
} catch (error) {
  data.status = "failed";
  data.error = error.stack;
  process.exitCode = 1;
  console.error(error);
} finally {
  try {
    await cleanup();
    await portsFree(allPorts);
  } catch (error) {
    data.status = "failed";
    data.error = `${data.error ?? ""}\nCleanup / port verification failed: ${error.stack}`;
    process.exitCode = 1;
  }
  data.finishedAt = new Date().toISOString();
  data.environment.loadAverageEnd = os.loadavg();
  await writeFile(`${output}.json`, JSON.stringify(data, null, 2) + "\n");
  await writeFile(`${output}.md`, renderReport(data));
  console.log(`Results: ${output}.{json,md} (${data.status})`);
}
