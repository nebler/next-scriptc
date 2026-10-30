import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = path.resolve(import.meta.dirname, "../../..");
const demo = path.join(root, "examples/demo");
const next = createRequire(path.join(demo, "package.json")).resolve("next/dist/bin/next");
const native = path.join(root, "packages/next-scriptc/src/cli.mjs");
if (!process.version.startsWith("v24.")) {
  throw new Error(`Benchmark requires Node 24.x; running ${process.version} (${process.execPath}). Rerun with Node 24 on PATH.`);
}
const cpus = os.cpus();
console.log({ node: process.version, executable: process.execPath, cpus: cpus.length,
  cpuModel: cpus[0]?.model, loadavg: os.loadavg(), platform: os.platform(), arch: os.arch() });
const port = 3417;
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => controller.abort(new Error(signal)));
const signal = () => AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]);
const quantile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const mib = (bytes) => (bytes / 1024 / 1024).toFixed(1);
let expected;

async function request(base, route) {
  const response = await fetch(new URL(route, base), { signal: signal() });
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status}: ${await response.text()}`);
  return response;
}

async function report(base, threads) {
  const response = await request(base, `/api/report?threads=${threads}`);
  const body = await response.json();
  assert.equal(body.threads, threads);
  assert.equal(body.sharedByReference, response.headers.get("x-next-scriptc") === "native");
  if (!body.sharedByReference) assert.match(body.nodeVersion, /^v24\./, "baseline server must run Node 24.x");
  const result = JSON.stringify(body.result);
  expected ??= result;
  assert.equal(result, expected, "report results must match across thread counts and modes");
  return body;
}

async function benchmark(base, label, sharedByReference) {
  console.log(`\n${label} — indicative only; loaded machine, not publishable performance numbers`);
  const rows = [];
  let baseline;
  for (const threads of [1, 2, 4, 8]) {
    const warm = await report(base, threads); // Includes any pool growth and JIT warm-up.
    if (sharedByReference !== undefined) assert.equal(warm.sharedByReference, sharedByReference, "server mode must match benchmark label");
    if (threads === 1) {
      console.log(`Serving runtime: ${warm.nodeVersion ?? "scriptc native"}`);
      console.log(`RSS scope: ${warm.sharedByReference ? "report binary only; excludes Next and other route binaries" : "whole production Next server, including worker threads"}.`);
      console.log(`RSS before dataset: ${mib(warm.baselineRss)} MiB; after dataset, before workers: ${mib(warm.datasetRss)} MiB.`);
      console.log("Average RSS growth/worker = (RSS - after-dataset RSS) / resident workers; includes runtime/allocator overhead, not exact clone size.");
    }
    const samples = [];
    for (let i = 0; i < 3; i++) samples.push(await report(base, threads));
    const elapsed = quantile(samples.map((sample) => sample.elapsedMs), 0.5);
    baseline ??= elapsed;
    rows.push({ threads, workers: samples[0].workers, "median ms": elapsed.toFixed(1), speedup: `${(baseline / elapsed).toFixed(2)}x`,
      "RSS MiB": mib(quantile(samples.map((sample) => sample.rss), 0.5)),
      "growth/worker MiB": mib(quantile(samples.map((sample) => sample.workerRssGrowth), 0.5)), shared: samples[0].sharedByReference });
  }
  console.table(rows);

  // Warm both probe endpoints before timing.
  for (const route of ["/", "/api/items/new"]) await (await request(base, route)).arrayBuffer();
  const deadline = performance.now() + 5000;
  let completed = 0;
  let loading = true;
  const load = (async () => {
    while (loading && performance.now() < deadline) {
      await report(base, 8);
      completed++;
    }
  })();
  async function probe(route) {
    const times = [];
    do {
      const start = performance.now();
      await (await request(base, route)).arrayBuffer();
      times.push(performance.now() - start);
      await delay(20, undefined, { signal: controller.signal });
    } while (performance.now() < deadline);
    return { route, samples: times.length, "p50 ms": quantile(times, 0.5).toFixed(1), "p99 ms": quantile(times, 0.99).toFixed(1) };
  }
  try {
    const [page, api] = await Promise.all([probe("/"), probe("/api/items/new"), load]);
    console.log(`Latency during back-to-back 8-thread reports (${completed} completed in ~5s):`);
    console.table([page, api]);
  } finally {
    loading = false;
    await load;
  }
}

async function assertPortsFree(ports) {
  for (const port of ports) {
    const server = createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    await new Promise((resolve) => server.close(resolve));
  }
}

async function withServer(entry, label, ports, baseline) {
  await assertPortsFree(ports);
  // Use this exact Node executable, bypassing pnpm shims and PATH selection.
  const child = spawn(process.execPath, [entry, "start", "-p", String(port)], {
    cwd: demo, detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NEXT_SCRIPTC_BASELINE: baseline ? "node" : "" },
  });
  let output = "";
  let done = false;
  const exit = new Promise((resolve) => {
    child.once("error", () => { done = true; resolve(); });
    child.once("exit", (code) => { done = true; resolve(code); });
  });
  const ready = new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(new Error(`Server startup timed out:\n${output}`)), 60_000);
    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("error", finish);
      child.off("exit", exited);
      controller.signal.removeEventListener("abort", aborted);
      if (error) reject(error); else resolve();
    }
    function exited(code, signal) { finish(new Error(`Server exited before ready (${signal ?? code}):\n${output}`)); }
    function aborted() { finish(controller.signal.reason); }
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => {
      output += chunk;
      if (!settled && /Ready in/.test(output)) finish();
    });
    child.once("error", finish);
    child.once("exit", exited);
    controller.signal.addEventListener("abort", aborted, { once: true });
    if (controller.signal.aborted) aborted();
  });
  const base = `http://localhost:${port}`;
  try {
    await ready;
    await benchmark(base, label, !baseline);
  } catch (error) {
    console.error(output);
    throw error;
  } finally {
    if (!done) process.kill(-child.pid, "SIGTERM");
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    }, 10_000);
    try { await exit; } finally { clearTimeout(timer); }
    await assertPortsFree(ports);
    console.log(`${label}: server stopped; owned ports are free.`);
  }
}

if (process.argv[2]) {
  await benchmark(process.argv[2], `Existing server ${process.argv[2]}`);
} else {
  try {
    await access(path.join(demo, ".next-node/BUILD_ID"));
  } catch (cause) {
    throw new Error("Missing Node production build. Run with Node 24: NEXT_SCRIPTC_BASELINE=node pnpm --filter demo exec next build", { cause });
  }
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(demo, ".next/scriptc/manifest.json"), "utf8"));
    const buildId = (await readFile(path.join(demo, ".next/BUILD_ID"), "utf8")).trim();
    assert.equal(manifest.buildId, buildId);
    for (const route of manifest.routes) await access(path.join(demo, ".next/scriptc", route.binary));
  } catch (cause) {
    throw new Error("Missing or invalid native build. Run with Node 24: pnpm --filter demo build", { cause });
  }
  const ports = [port, ...manifest.routes.map((route) => route.port)];
  // Separate sequential runs avoid two datasets/pools competing for memory/CPU.
  await withServer(next, "Node (next build + next start, adapter disabled)", ports, true);
  await withServer(native, "Native (next-scriptc start)", ports, false);
}
