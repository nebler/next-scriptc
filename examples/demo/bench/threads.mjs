import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = path.resolve(import.meta.dirname, "../../..");
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
  const result = JSON.stringify(body.result);
  expected ??= result;
  assert.equal(result, expected, "report results must match across thread counts and modes");
  return body;
}

async function benchmark(base, label) {
  console.log(`\n${label} — indicative only; loaded machine, not publishable performance numbers`);
  const rows = [];
  let baseline;
  for (const threads of [1, 2, 4, 8]) {
    await report(base, threads); // Includes any pool growth and JIT warm-up.
    const samples = [];
    for (let i = 0; i < 3; i++) samples.push(await report(base, threads));
    const elapsed = quantile(samples.map((sample) => sample.elapsedMs), 0.5);
    baseline ??= elapsed;
    rows.push({ threads, "median ms": elapsed.toFixed(1), speedup: `${(baseline / elapsed).toFixed(2)}x`,
      "RSS MiB": mib(quantile(samples.map((sample) => sample.rss), 0.5)),
      "dataset RSS MiB": mib(samples[0].datasetRss), shared: samples[0].sharedByReference });
  }
  console.table(rows);

  // Precompile both probe endpoints before timing next dev.
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

async function withServer(command, label, ports) {
  await assertPortsFree(ports);
  const child = spawn("pnpm", ["--filter", "demo", command, "-p", String(port)], {
    cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let done = false;
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { output += chunk; });
  const exit = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => { done = true; resolve(code); });
  });
  const base = `http://localhost:${port}`;
  try {
    const deadline = performance.now() + 60_000;
    while (!/Ready in/.test(output)) {
      controller.signal.throwIfAborted();
      if (done || performance.now() > deadline) throw new Error(`Server failed to start:\n${output}`);
      await delay(100);
    }
    await benchmark(base, label);
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
  const manifest = JSON.parse(await readFile(path.join(root, "examples/demo/.next/scriptc/manifest.json"), "utf8"));
  const ports = [port, ...manifest.routes.map((route) => route.port)];
  // Separate sequential runs avoid two datasets/pools competing for memory/CPU.
  await withServer("dev", "Node (next dev / Turbopack)", ports);
  await withServer("start", "Native (next-scriptc start)", ports);
}
