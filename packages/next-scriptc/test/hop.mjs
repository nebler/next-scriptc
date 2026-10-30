// Indicative end-to-end latency on the local machine. Build .next and .next-node
// sequentially first; the script starts and stops every server it measures.
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";

const demo = path.resolve(import.meta.dirname, "../../../examples/demo");
const require = createRequire(path.join(demo, "package.json"));
const next = require.resolve("next/dist/bin/next");
const cli = path.resolve(import.meta.dirname, "../src/cli.mjs");
const manifest = JSON.parse(await readFile(path.join(demo, ".next/scriptc/manifest.json"), "utf8"));
const route = manifest.routes.find((route) => route.pattern === "/api/hello");
assert.ok(route);
const port = 3427;
const processes = new Set();
const result = {
  node: process.version, date: new Date().toISOString(), samples: [],
  buildIds: { native: manifest.buildId, node: (await readFile(path.join(demo, ".next-node/BUILD_ID"), "utf8")).trim() },
};

function start(args, env = {}) {
  const child = spawn(process.execPath, args, { cwd: demo, env: { ...process.env, ...env }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const state = { child, output: "", done: false };
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (data) => { state.output += data; });
  state.exit = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => { state.done = true; resolve({ code, signal }); });
  });
  processes.add(state);
  return state;
}
async function stop(state) {
  if (!state.done) process.kill(-state.child.pid, "SIGTERM");
  const timer = setTimeout(() => { if (!state.done) process.kill(-state.child.pid, "SIGKILL"); }, 5000);
  try { await state.exit; } finally { clearTimeout(timer); processes.delete(state); }
}
function get(port, agent) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/api/hello", agent }, (res) => {
      const chunks = [];
      res.on("data", (data) => chunks.push(data));
      res.on("end", () => { if (res.statusCode !== 200) reject(new Error(`HTTP ${res.statusCode}`));
        else resolve(Buffer.concat(chunks)); });
      res.on("error", reject);
    });
    req.setTimeout(10_000, () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
  });
}
async function ready(state) {
  const end = performance.now() + 60_000;
  while (performance.now() < end) {
    assert.equal(state.done, false, state.output);
    try { await get(port, false); return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server readiness timed out\n${state.output}`);
}
async function measure(name, target, concurrency) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: concurrency });
  const count = 600;
  try {
    for (let i = 0; i < 40; i++) await get(target, agent);
    const times = [];
    const started = performance.now();
    let next = 0;
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (next++ < count) {
        const before = performance.now();
        const body = await get(target, agent);
        assert.equal(body.toString(), '{"message":"Hello from next-scriptc!"}');
        times.push(performance.now() - before);
      }
    }));
    const elapsed = performance.now() - started;
    times.sort((a, b) => a - b);
    const sample = { name, concurrency, requests: count, elapsedMs: elapsed, rps: count * 1000 / elapsed,
      meanMs: times.reduce((a, b) => a + b, 0) / count, p50Ms: times[Math.floor(count * 0.5)], p95Ms: times[Math.floor(count * 0.95)] };
    result.samples.push(sample);
    console.log(JSON.stringify(sample));
  } finally { agent.destroy(); }
}
async function free(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  await new Promise((resolve) => server.close(resolve));
}
try {
  for (const candidate of [port, ...manifest.routes.map((route) => route.port)]) await free(candidate);
  const node = start([next, "start", "-p", String(port)], { NEXT_SCRIPTC_BASELINE: "node" });
  try { await ready(node); for (const concurrency of [1, 16]) await measure("Node next start", port, concurrency); }
  finally { await stop(node); }
  const native = start([cli, "start", "-p", String(port)]);
  try {
    await ready(native);
    // Observe a persistent loopback connection after each complete frontend GET.
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    try {
      const connections = [];
      for (let i = 0; i < 3; i++) {
        await get(port, agent);
        const { stdout } = await promisify(execFile)("lsof", ["-nP", `-iTCP:${route.port}`, "-sTCP:ESTABLISHED"]);
        connections.push(stdout);
      }
      result.loopbackConnections = connections;
    } finally { agent.destroy(); }
    for (const concurrency of [1, 16]) {
      // Alternating targets reduces (but cannot eliminate) scheduling bias.
      await measure("native through Next", port, concurrency);
      await measure("native direct", route.port, concurrency);
    }
  } finally { await stop(native); }
} finally {
  for (const state of processes) await stop(state);
  for (const candidate of [port, ...manifest.routes.map((route) => route.port)]) await free(candidate);
  result.portsFree = true;
  await writeFile(path.join(import.meta.dirname, "hop-results.json"), JSON.stringify(result, null, 2) + "\n");
}
