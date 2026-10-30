import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { routes, profiles, isolation, serverEnv, sectionsOption, productionCommand } from "./config.mjs";
import { request, digest } from "./load.mjs";
import { exec, start, ready, stop, finish, census, measure, portsFree, cleanup, signal, accounting } from "./processes.mjs";
import { coverage } from "./coverage.mjs";
import { threadsBenchmark } from "./threads.mjs";
import { renderReport, definitions, limitations } from "./report.mjs";

const { values } = parseArgs({ options: { profile: { type: "string", default: "sandbox" },
  output: { type: "string" }, "resume-cold": { type: "string" }, reverse: { type: "boolean", default: false }, sections: { type: "string" }, "native-start": { type: "string", default: "adapter" } } });
const profile = profiles[values.profile];
if (!profile) throw new Error("--profile must be sandbox or quick");
const sections = sectionsOption(values.sections);
if (!["next", "adapter"].includes(values["native-start"])) throw new Error("--native-start must be next or adapter");
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
  schemaVersion: 2, status: "running", label: values.profile === "quick" || process.platform !== "linux"
    ? "INDICATIVE ONLY: developer machine / reduced repetitions; not publishable performance evidence"
    : "Controlled sandbox candidate: review limitations and environmental noise before publication",
  startedAt: new Date().toISOString(), profile: { name: values.profile, ...profile, reverse: values.reverse, sections, nativeStart: values["native-start"] },
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
  isolation, definitions, limitations, coverage: {}, artifacts: [], rows: [],
  sourceSnapshot: await sourceSnapshot(),
};
// Hash source and native artifacts so a dirty/local run is still identifiable.
for (const [index, route] of manifest.routes.entries()) data.artifacts.push({ pattern: route.pattern,
  sourceSha256: digest(await readFile(route.source)), entrySha256: digest(await readFile(path.join(demo, ".next/scriptc", `entry-${index}.ts`))),
  binarySha256: digest(await readFile(path.join(demo, ".next/scriptc", route.binary))) });
// Resume only an interrupted cold section, never merge steady statistics from
// different harnesses. Preserve the original run and require identical builds.
if (values["resume-cold"]) {
  const previous = JSON.parse(await readFile(path.resolve(values["resume-cold"]), "utf8"));
  assert.equal(previous.status, "failed");
  assert.equal(previous.profile.name, values.profile);
  assert.ok(previous.rows.every((row) => row.metric === "cold-start"));
  assert.deepEqual(previous.artifacts, data.artifacts, "Cannot resume cold results from different artifacts");
  for (const name of ["node", "scriptc", "next", "nodeBuildId", "nativeBuildId"]) assert.equal(previous.environment[name], data.environment[name]);
  const shared = (snapshot) => snapshot.filter(({ file }) => !["examples/demo/bench/run.mjs", "examples/demo/bench/report.mjs"].includes(file));
  assert.deepEqual(shared(previous.sourceSnapshot), shared(data.sourceSnapshot), "App, adapter, fixtures or transport changed since cold measurements");
  assert.deepEqual(previous.environment.publicFixtureEnvironment, serverEnv);
  assert.equal(previous.profile.nativeStart, values["native-start"]);
  assert.equal(previous.definitions["cold-start"], definitions["cold-start"]);
  data.rows = previous.rows;
  data.coverage = previous.coverage;
  data.resumedCold = { file: values["resume-cold"], startedAt: previous.startedAt, finishedAt: previous.finishedAt,
    error: previous.error, environment: previous.environment, sourceSnapshot: previous.sourceSnapshot };
}
const fingerprints = new Map();
function validate(route, response) {
  const hash = digest(response.body);
  if (fingerprints.has(route.id)) assert.equal(hash, fingerprints.get(route.id), `Response parity failed: ${route.id}`);
  else fingerprints.set(route.id, hash);
  return hash;
}
function record(row) { data.rows.push(row); }
function workloadFailure(error, proc, scope, runtime, route, phase) {
  if (signal.aborted || !/HTTP \d+|Request timed out|Generator exited before warmup/.test(String(error))) throw error;
  record({ metric: "workload-failure", scope, runtime, route: route.id, category: route.category, phase,
    error: error.stack, serverOutput: proc.output });
  console.error(`FAILED ${scope}/${runtime}/${route.id}/${phase}: ${error.message}`);
}
const nextPort = 3417;
const allPorts = [nextPort, ...manifest.routes.map((route) => route.port)];
function launch(scope, runtime, route) {
  if (scope === "direct") return start(runtime === "node" ? process.execPath : route.binary,
    runtime === "node" ? [route.entry] : [], { cwd: demo, cpus: serverCpus, role: `${runtime}-route`, env: { ...serverEnv, PORT: String(route.port) } });
  return start(process.execPath, productionCommand({ runtime, nativeStart: values["native-start"], next, cli, port: nextPort }),
    { cwd: demo, cpus: serverCpus, role: runtime === "node" || values["native-start"] === "next" ? "next-server" : "adapter-supervisor", env: { ...serverEnv, NEXT_SCRIPTC_BASELINE: runtime === "node" ? "node" : "" } });
}
function generator(base, spec, options, ipc = false) {
  const { entry, binary, ...wire } = spec;
  return start(process.execPath, [path.join(demo, "bench/load.mjs"), JSON.stringify({ base, spec: wire, ...options })],
    { cwd: demo, cpus: loadCpus, ipc });
}
async function sampleLoad(proc, base, spec, options) {
  const client = generator(base, spec, options, true);
  try {
    await new Promise((resolve, reject) => {
      client.child.once("message", resolve);
      client.exited.then(() => reject(new Error(`Generator exited before warmup: ${client.output}`)));
      const timer = setTimeout(() => reject(new Error("Generator warmup exceeded 120 seconds")), 120_000);
      timer.unref();
      client.child.once("message", () => clearTimeout(timer));
      client.exited.then(() => clearTimeout(timer));
    });
    return await measure(proc, () => {
      client.child.send({ start: true });
      return finish(client);
    });
  } finally { await stop(client); }
}
async function cold(scope, runtime, route, repeat) {
  await portsFree(allPorts);
  const proc = launch(scope, runtime, route);
  try {
    const response = await ready(proc, `http://127.0.0.1:${scope === "direct" ? route.port : nextPort}`, route);
    validate(route, response);
    record({ metric: "cold-start", scope, runtime, route: route.id, category: route.category, repeat, ms: response.coldMs });
  } catch (error) { workloadFailure(error, proc, scope, runtime, route, "cold"); }
  finally { await stop(proc); await portsFree(allPorts); }
}
async function steady(scope, runtime, selected) {
  await portsFree(allPorts);
  let proc = launch(scope, runtime, selected[0]);
  const base = `http://127.0.0.1:${scope === "direct" ? selected[0].port : nextPort}`;
  try {
    const initial = scope === "end-to-end" ? active.find((route) => route.id === "hello") : selected[0];
    let first = await ready(proc, base, initial);
    validate(initial, first);
    // Readiness itself executes one request. "Idle" is after that request and a
    // fixed quiet interval, never a misleading claim of pre-initialization RSS.
    await delay(profile.idleMs, undefined, { signal });
    record({ metric: "memory-idle", scope, runtime, initializedBy: initial.id,
      memory: await census(proc) });
    for (const [index, route] of selected.entries()) {
      try {
        const hash = validate(route, route === initial ? first : await request(base, route));
        const spec = { ...route, digest: hash };
        console.log(`${scope}/${runtime}/${route.id}: estimated ${route.bounded ? "60–120" : "5–15"} s; ${route.bounded ? "C=1, one warmup + 3 measured requests" : "CPU + C=" + profile.concurrency.join(",")}`);
        if (route.bounded) {
          // One sample supplies both CPU and latency: only three cost-10 bcrypts
          // are measured. No duration window can over-dispatch expensive work.
          const sample = await sampleLoad(proc, base, spec, { count: 3, concurrency: 1, warmupCount: 1 });
          assert.equal(sample.result.requests, 3);
          record({ metric: "cpu-fixed-count", scope, runtime, route: route.id, category: route.category, repeat: 0, ...sample, cpuMsPerRequest: sample.cpuMs / 3 });
          record({ metric: "throughput-latency", scope, runtime, route: route.id, category: route.category, concurrency: 1, repeat: 0, budget: "3 fixed requests; p99 is max of three, no tail claim", ...sample });
          continue;
        }
        for (let repeat = 0; repeat < profile.repeats; repeat++) {
          const count = Math.min(route.cpuRequests, profile.cpuCap);
          const sample = await sampleLoad(proc, base, spec, { count, concurrency: 1, warmupMs: profile.warmupMs });
          assert.equal(sample.result.requests, count);
          record({ metric: "cpu-fixed-count", scope, runtime, route: route.id, category: route.category, repeat, ...sample,
            cpuMsPerRequest: sample.cpuMs / count });
        }
        for (const concurrency of profile.concurrency) for (let repeat = 0; repeat < profile.repeats; repeat++) {
          const sample = await sampleLoad(proc, base, spec, { durationMs: profile.durationMs, concurrency, warmupMs: profile.warmupMs });
          record({ metric: "throughput-latency", scope, runtime, route: route.id, category: route.category,
            concurrency, repeat, ...sample });
        }
      } catch (error) {
        workloadFailure(error, proc, scope, runtime, route, "steady");
        // A proxy timeout does not preempt synchronous work in the binary.
        // Kill the whole tree before another route can share its CPU budget.
        if (scope === "end-to-end" && index + 1 < selected.length) {
          await stop(proc);
          await portsFree(allPorts);
          proc = launch(scope, runtime);
          first = await ready(proc, base, initial);
          validate(initial, first);
          await delay(profile.idleMs, undefined, { signal });
          record({ metric: "memory-idle", scope, runtime, initializedBy: initial.id, restartedAfter: route.id,
            memory: await census(proc) });
        }
      }
    }
  } finally { await stop(proc); await portsFree(allPorts); }
}

await mkdir(path.dirname(output), { recursive: true });
try {
  const estimates = { coverage: "30–90 s", cold: "60–150 s", direct: "150–240 s", production: "150–240 s", isolation: "30–90 s", threads: "60–180 s" };
  console.log(`Profile ${values.profile}; sections ${sections.join(",")}. Sandbox suite estimate 8–17 min; install/build allowance 8 min; hard runner budget 28 min.`);
  for (const section of sections) {
    console.log(`Section ${section}: estimated ${estimates[section]} (shared-host load can extend this)`);
    if (section === "coverage") {
      if (data.resumedCold) continue;
      const compiler = path.resolve(path.dirname(compilerRequire.resolve("scriptc/package.json")), compilerRequire("scriptc/package.json").bin.scriptc);
      const targets = [...active, { id: "report", entry: path.join(demo, ".next/scriptc", `entry-${manifest.routes.findIndex((r) => r.pattern === "/api/report")}.ts`) }];
      for (const route of targets) data.coverage[route.id] = await coverage(compiler, route.entry, demo);
    } else if (section === "cold") {
      for (const scope of ["direct", "end-to-end"]) for (const route of active) {
        const repeats = route.bounded ? 1 : profile.coldRepeats;
        for (let repeat = 0; repeat < repeats; repeat++) {
          for (const runtime of repeat % 2 ? ["native", "node"] : ["node", "native"]) {
            if (!data.rows.some((row) => row.metric === "cold-start" && row.scope === scope && row.runtime === runtime && row.route === route.id && row.repeat === repeat)) await cold(scope, runtime, route, repeat);
          }
        }
      }
    } else if (section === "direct" || section === "production") {
      const scope = section === "direct" ? "direct" : "end-to-end";
      for (const runtime of values.reverse ? ["native", "node"] : ["node", "native"]) {
        if (scope === "direct") for (const route of active) await steady(scope, runtime, [route]);
        else await steady(scope, runtime, active);
      }
    } else if (section === "isolation") {
      for (const runtime of values.reverse ? ["native", "node"] : ["node", "native"]) {
        await portsFree(allPorts);
        let proc = launch("end-to-end", runtime);
        const base = `http://127.0.0.1:${nextPort}`;
        try {
          await ready(proc, base, isolation.probes[1]);
          for (const probe of isolation.probes) await request(base, probe);
          for (const [index, heavy] of isolation.heavy.entries()) {
            try {
              await request(base, heavy);
              for (let repeat = 0; repeat < profile.repeats; repeat++) {
                for (const loaded of [false, true]) {
                  const result = await finish(generator(base, {}, { probes: isolation.probes,
                    heavy: loaded ? heavy : undefined, durationMs: profile.isolationMs }));
                  record({ metric: loaded ? "isolation-loaded" : "isolation-idle", scope: "end-to-end", runtime, heavyRequest: heavy, repeat, result });
                }
              }
            } catch (error) {
              workloadFailure(error, proc, "end-to-end", runtime, heavy, "isolation");
              if (index + 1 < isolation.heavy.length) {
                await stop(proc);
                await portsFree(allPorts);
                proc = launch("end-to-end", runtime);
                await ready(proc, base, isolation.probes[1]);
                for (const probe of isolation.probes) await request(base, probe);
              }
            }
          }
        } finally { await stop(proc); await portsFree(allPorts); }
      }
    } else if (section === "threads") await threadsBenchmark({ demo, manifest, profile, cpus: threadCpus, record });
  }
  for (const [index, route] of manifest.routes.entries()) {
    const original = data.artifacts[index];
    assert.equal(digest(await readFile(route.source)), original.sourceSha256, `Source changed during benchmark: ${route.source}`);
    assert.equal(digest(await readFile(path.join(demo, ".next/scriptc", `entry-${index}.ts`))), original.entrySha256, "Generated entry changed during benchmark");
    assert.equal(digest(await readFile(path.join(demo, ".next/scriptc", route.binary))), original.binarySha256, "Binary changed during benchmark");
  }
  assert.equal(manifest.buildId, (await readFile(path.join(demo, ".next/BUILD_ID"), "utf8")).trim(), "Native build changed during benchmark");
  assert.equal(data.environment.nodeBuildId, (await readFile(path.join(demo, ".next-node/BUILD_ID"), "utf8")).trim(), "Node build changed during benchmark");
  assert.deepEqual(await sourceSnapshot(), data.sourceSnapshot, "Application, benchmark, adapter or lockfile changed during benchmark");
  data.status = data.rows.some((row) => row.metric === "workload-failure") ? "failed" : "complete";
  if (data.status === "failed") process.exitCode = 1;
  data.completedSections = sections;
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
