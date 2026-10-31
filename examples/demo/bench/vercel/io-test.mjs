import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { arrivalSchedule, openLoop, createIoClient, closedLoop } from "./io-client.mjs";
import { digest } from "../io/fixtures.mjs";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("registered arrivals have fixed 7/2/1 mix and three bursts", () => {
  const arrivals = arrivalSchedule();
  assert.equal(arrivals.length, 840);
  assert.deepEqual(Object.fromEntries(["orders-get", "orders-post", "payment"].map((key) => [key, arrivals.filter((r) => r.workload === key).length])), { "orders-get": 588, "orders-post": 168, payment: 84 });
  assert.equal(arrivals.filter((r) => r.scheduledMs >= 8000 && r.scheduledMs < 10000).length, 120);
  assert.equal(arrivals.at(-1).scheduledMs < 30000, true);
});

test("arrivals continue while requests are outstanding and include dispatch lag", async () => {
  let outstanding = 0, peak = 0;
  const client = { agent: () => ({ createConnection() {}, destroy() {} }), request: async () => {
    const start = performance.now(); outstanding++; peak = Math.max(peak, outstanding); await delay(100); outstanding--; return { ms: performance.now() - start };
  } };
  const arrivals = Array.from({ length: 5 }, (_, i) => ({ index: i, scheduledMs: i * 5, workload: "orders-get" }));
  const result = await openLoop(client, "http://localhost", { arrivals });
  assert.equal(result.status, "complete"); assert.equal(peak, 5);
  for (const row of result.samples) assert.ok(row.scheduledLatencyMs >= row.ms && row.dispatchLagMs >= 0);
  assert.equal(outstanding, 0);
});

test("safety-cap rejections remain scheduled errors, outstanding work drains", async () => {
  const client = { agent: () => ({ createConnection() {}, destroy() {} }), request: async () => { await delay(60); return { ms: 60 }; } };
  const arrivals = Array.from({ length: 4 }, (_, i) => ({ index: i, scheduledMs: 0, workload: "orders-get" }));
  const result = await openLoop(client, "http://localhost", { arrivals, maxInFlight: 1 });
  assert.equal(result.status, "failed"); assert.equal(result.planned, 4); assert.equal(result.issued, 1);
  assert.equal(result.errors, 3); assert.equal(result.errorRate, .75); assert.equal(result.samples.length, 4);
  assert.equal(result.scheduledLatencyCoverage, 1);
});

test("HTTP transport validates full response bytes/status and enforces attempt budget", async () => {
  const server = createServer((req, res) => { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); res.end('{"ok":true}'); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`, client = createIoClient({ budget: 2 }), pool = client.agent(url, 1);
  try {
    const valid = await client.request(url, { path: "/", expected: digest('{"ok":true}') }, pool);
    assert.ok(valid.ms > 0);
    await assert.rejects(client.request(url, { path: "/", expected: "bad" }, pool), (e) => e.correctness === true);
    await assert.rejects(client.request(url, { path: "/" }, pool), /budget exhausted/);
    assert.equal(client.issued, 2);
  } finally { pool.destroy(); await new Promise((resolve) => server.close(resolve)); }
});

test("failed warmup prevents measurement and preserves drained partial samples", async () => {
  let issued = 0, active = 0;
  const client = { agent: () => ({ createConnection() {}, destroy() { assert.equal(active, 0); } }), request: async () => {
    const index = issued++; active++; await delay(index === 0 ? 5 : 30); active--;
    if (index === 0) throw Object.assign(new Error("body mismatch"), { correctness: true });
    return { ms: 30 };
  } };
  const result = await closedLoop(client, "http://localhost", "orders-get", 4, 10, 100, "test");
  assert.equal(result.status, "failed"); assert.equal(result.correctness, true); assert.equal(issued, 4);
  assert.equal(result.warmup.samples.length, 4); assert.equal(result.warmup.requestsPerSecond, null);
});

test("correctness failure cancels future arrivals but retains all scheduled outcomes", async () => {
  const client = { agent: () => ({ createConnection() {}, destroy() {} }), request: async () => { throw Object.assign(new Error("body mismatch"), { correctness: true }); } };
  const arrivals = Array.from({ length: 3 }, (_, i) => ({ index: i, scheduledMs: i * 20, workload: "orders-get" }));
  const result = await openLoop(client, "http://localhost", { arrivals });
  assert.equal(result.status, "failed"); assert.equal(result.issued, 1);
  assert.equal(result.samples.length, 3); assert.equal(result.errors, 3);
  assert.equal(result.samples.filter((r) => r.status === "cancelled").length, 2);
});
