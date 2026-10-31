// Focused harness regression checks; no application benchmark repetitions.
import assert from "node:assert/strict";
import http from "node:http";
import { gzipSync } from "node:zlib";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { fixtureBody } from "./fixtures.mjs";
import { load, digest } from "./load.mjs";
import { parseCoverage } from "./coverage.mjs";
import { sectionsOption, productionCommand } from "./config.mjs";
for (const close of [false, true]) {
  let sockets = 0;
  const server = http.createServer((req, res) => {
    if (close) res.setHeader("connection", "close");
    res.end("fixture");
  });
  server.on("connection", () => sockets++);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const result = await load(base, { path: "/", digest: digest(Buffer.from("fixture")) }, { count: 40, warmupCount: 5 });
    assert.equal(result.requests, 40);
    assert.equal(result.connectionsCreatedBeforeWindow, close ? 5 : 1);
    assert.equal(result.warmup.requests, 5);
    assert.equal(result.connectionsCreated, close ? 40 : 0);
    assert.equal(sockets, close ? 45 : 1);
    assert.equal(result.reusedRequests, close ? 0 : 40);
    await assert.rejects(load(base, { path: "/", digest: "wrong" }, { count: 1 }), /Response changed/);
    const concurrent = await load(base, { path: "/" }, { count: 43, concurrency: 8, warmupCount: 8 });
    assert.equal(concurrent.requests, 43);
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}
// Exercise real subprocess serialization and full binary uploads, rather than
// placing a MiB body in argv. Also reject wrong gzip headers and decoded bytes.
let uploadRequests = 0;
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (req.method === "POST") {
    assert.deepEqual(Buffer.concat(chunks), fixtureBody("upload-1mib"));
    assert.equal(Number(req.headers["content-length"]), 1024 * 1024);
    uploadRequests++;
  }
  res.setHeader("content-encoding", "gzip");
  res.setHeader("content-type", "application/json");
  res.end(gzipSync('"fixture"'));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const base = `http://127.0.0.1:${server.address().port}`;
  const spec = { path: "/", method: "POST", bodyFixture: "upload-1mib", responseEncoding: "gzip",
    responseHeaders: { "content-encoding": "gzip", "content-type": "application/json" }, digest: digest(Buffer.from('"fixture"')) };
  const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL("./load.mjs", import.meta.url)),
    JSON.stringify({ base, spec, count: 2, warmupCount: 1 })], { timeout: 10_000 });
  assert.equal(JSON.parse(stdout).requests, 2);
  assert.equal(uploadRequests, 3);
  await assert.rejects(load(base, { ...spec, method: "GET", bodyFixture: undefined, responseHeaders: { "content-encoding": "br" } }, { count: 1 }), /unexpected content-encoding/);
  await assert.rejects(load(base, { ...spec, method: "GET", bodyFixture: undefined, digest: "wrong" }, { count: 1 }), /Response changed/);
} finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }

const parsed = parseCoverage(`statements analyzed 435\ncompile statically 430 (99%)\n in dynamic tier 201\n\n npm package compilation:\n   bcryptjs  static\n   jose  static\n\n diagnostics`);
assert.equal(parsed.dynamicTierStatements, 201);
assert.deepEqual(parsed.packages, [{ name: "bcryptjs", mode: "static" }, { name: "jose", mode: "static" }]);
assert.throws(() => parseCoverage("format changed"));
assert.deepEqual(sectionsOption("threads"), ["coverage", "threads"]);
assert.throws(() => sectionsOption("missing"));
assert.equal(productionCommand({ next: "next", port: 123 })[0], "next");
console.log("Harness checks passed: warmed socket accounting (keep-alive and reconnect), exact counts at C=8, digest rejection, subprocess 1 MiB uploads, gzip decoded parity/headers, coverage parsing, section validation, centralized start command. All test sockets closed.");

// Production topology selection must never leak a parent's baseline/group flag.
const { variants, variant, runtimesFor, groupedAvailability, validateLightGroup, validateReleaseBuild, lightPatterns } = await import("./variants.mjs");
const { deriveSummary } = await import("./summary.mjs");
assert.deepEqual(variants.map((v) => v.distDir), [".next-node", ".next", ".next-grouped"]);
assert.deepEqual(variant("node").env, { NEXT_SCRIPTC_BASELINE: "node", NEXT_SCRIPTC_DEMO_GROUPS: "" });
assert.deepEqual(variant("native").env, { NEXT_SCRIPTC_BASELINE: "", NEXT_SCRIPTC_DEMO_GROUPS: "" });
assert.equal(variant("native-grouped").env.NEXT_SCRIPTC_DEMO_GROUPS, "light");
assert.throws(() => variant("typo"));
const ids = variants.map((v) => v.id);
assert.deepEqual(runtimesFor("direct", ids, true), ["native", "node"]);
assert.deepEqual(runtimesFor("end-to-end", ids), ids);
assert.deepEqual(runtimesFor("end-to-end", ids, true), [...ids].reverse());
assert.deepEqual(runtimesFor("end-to-end", ids), ids); // reverse never mutates registry
assert.equal((await groupedAvailability({ exists: false, profile: "quick" })).status, "skipped");
await assert.rejects(groupedAvailability({ exists: false, profile: "sandbox" }), /requires .next-grouped/);
assert.equal((await groupedAvailability({ exists: true, profile: "sandbox" })).status, "available");
const grouped = { routes: lightPatterns.map((pattern) => ({ pattern, port: 123, binary: "group" })) };
validateLightGroup(grouped);
validateReleaseBuild({ routes: [{ pattern: "/a", binary: "a", port: 1, optimization: "release" }], processes: [{ optimization: "release" }] });
assert.throws(() => validateReleaseBuild({ routes: [{ optimization: "speed" }] }), /release optimization/);
assert.throws(() => validateReleaseBuild({ routes: [], processes: [{ optimization: "speed" }] }), /release optimization/);
assert.throws(() => validateReleaseBuild(grouped), /separate processes/);
assert.throws(() => validateLightGroup({ routes: grouped.routes.map((r) => ({ ...r, optimization: "speed" })) }), /release optimization/);

assert.throws(() => validateLightGroup({ routes: grouped.routes.slice(1) }), /missing/);
assert.throws(() => validateLightGroup({ routes: [...grouped.routes, { pattern: "/api/login", port: 123, binary: "group" }] }), /unregistered/);
assert.throws(() => validateLightGroup({ routes: grouped.routes.map((r, i) => ({ ...r, port: 123 + i })) }), /eight-route/);

const measured = { variants: variants.map((v) => ({ ...v, status: "available" })),
  workloads: [{ id: "fixture" }, { id: "bounded", bounded: true }, { id: "refused", enabled: false, pending: "compiler refusal" }], rows: [] };
for (const [i, runtime] of ids.entries()) for (const value of [1, 3]) {
  const factor = i + 1;
  measured.rows.push(
    { scope: "end-to-end", runtime, route: "fixture", metric: "throughput-latency", peak: { rssBytes: value * factor * 2 ** 20 }, concurrency: 1, result: { p50Ms: value * factor } },
    { scope: "end-to-end", runtime, route: "fixture", metric: "throughput-latency", peak: { rssBytes: value * factor * 2 ** 20 }, concurrency: 64, result: { requestsPerSecond: 100 * value / factor, generatorSaturationSuspected: i === 2 } },
    { scope: "end-to-end", runtime, route: "fixture", metric: "cpu-fixed-count", cpuMsPerRequest: value * factor, peak: { rssBytes: value * factor * 2 ** 20 } },
    { scope: "end-to-end", runtime, route: "fixture", metric: "cold-start", ms: 10 * value * factor },
    { scope: "end-to-end", runtime, metric: "memory-idle", memory: { rssBytes: 5 * value * factor * 2 ** 20 } });
}
measured.rows.push({ scope: "direct", runtime: "node", route: "fixture", metric: "cold-start", ms: 999999 });
let summary = deriveSummary(measured);
const fixture = summary.workloads[0].variants;
assert.equal(fixture[0].cells.latency.value, 2); // median, not first/best row
assert.equal(fixture[1].cells.latency.ratio, 2);
assert.equal(fixture[2].cells.throughput.value, 200 / 3);
assert.ok(Math.abs(fixture[2].cells.throughput.ratio - 1 / 3) < 1e-12);
assert.equal(fixture[2].cells.throughput.saturation, true);
assert.equal(fixture[0].cells.cold.value, 20); // excludes direct
assert.equal(summary.memory[1].idleMiB, 20);
assert.equal(summary.memory[2].loadedMiB, 9); // max simultaneous peak, not sum
assert.equal(summary.memory[2].loadedRatio, 3);
assert.match(summary.workloads[1].variants[0].cells.throughput.status, /bounded C=1/);
assert.match(summary.workloads[2].variants[0].cells.cold.status, /compiler refusal/);
measured.rows.push({ scope: "end-to-end", runtime: "native", route: "fixture", metric: "workload-failure", phase: "steady", reason: "next-proxy-timeout" });
summary = deriveSummary(measured);
assert.equal(summary.workloads[0].variants[1].cells.latency.value, null);
assert.match(summary.workloads[0].variants[1].cells.cpu.status, /FAILED/);
assert.equal(summary.workloads[0].variants[1].cells.cold.value, 40); // independent cold phase
assert.match(summary.memory[1].status, /partial/);
measured.variants[2] = { ...measured.variants[2], status: "skipped", reason: "missing grouped build" };
assert.match(deriveSummary(measured).workloads[0].variants[2].cells.cold.status, /skipped/);
measured.rows = measured.rows.filter((r) => r.runtime !== "node");
assert.equal(deriveSummary(measured).workloads[0].variants[2].cells.cpu.ratio, null);
console.log("Variant and summary checks passed: three production modes, direct exclusion, explicit grouped skip/requirement, light membership, medians, ratios/directions, saturation, peak RSS, bounded/refused/failed/absent cells.");
