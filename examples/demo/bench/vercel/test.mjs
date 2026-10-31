import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import https from "node:https";
import test from "node:test";
import { createClient, measure } from "./client.mjs";
import { digest } from "../load.mjs";

const body = Buffer.from('{"ok":true}');
function transport(statusFor) {
  let calls = 0;
  const original = https.request;
  https.request = (_url, _options, callback) => {
    const index = calls++;
    const req = new EventEmitter();
    req.reusedSocket = true;
    req.destroy = (error) => req.emit("error", error);
    req.end = () => queueMicrotask(() => {
      const res = new EventEmitter();
      res.statusCode = statusFor(index);
      res.headers = { "x-vercel-cache": "MISS", "x-vercel-id": `test-${index}` };
      callback(res);
      res.emit("data", res.statusCode === 200 ? body : Buffer.from("sensitive error body"));
      res.emit("end");
    });
    return req;
  };
  return () => { https.request = original; return calls; };
}

test("a failing concurrent warmup drains and retains all outstanding timings without measuring", async () => {
  const restore = transport((index) => index === 0 ? 500 : 200);
  try {
    const client = createClient("test-only", 100);
    const result = await client.window("https://example.test", { path: "/" }, 16, 32, { count: 50 }, digest(body), true);
    assert.equal(result.status, "failed");
    assert.equal(client.issued, 16);
    assert.equal(result.warmup.requests, 15);
    assert.equal(result.warmup.samples.length, 16);
    assert.equal(result.warmup.samples.filter((s) => s.error).length, 1);
    assert.match(result.error, /HTTP 500/);
    assert(!JSON.stringify(result).includes("sensitive error body"));
    assert.equal(result.requests, undefined);
  } finally { restore(); }
});

test("the shared request budget cannot be exceeded by concurrent workers", async () => {
  const restore = transport(() => 200);
  try {
    const client = createClient("test-only", 4);
    const result = await client.window("https://example.test", { path: "/" }, 2, 2, { count: 50 }, digest(body), true);
    assert.equal(client.issued, 4);
    assert.equal(result.status, "failed");
    assert.equal(result.requests, 2);
    assert.match(result.error, /budget exhausted/);
  } finally { assert.equal(restore(), 4); }
});

test("response mismatch invalidates the window and retains its error", async () => {
  const restore = transport(() => 200);
  try {
    const client = createClient("test-only");
    const result = await client.window("https://example.test", { path: "/" }, 1, 1, { count: 1 }, "wrong-digest", true);
    assert.equal(result.status, "failed");
    assert.match(result.error, /Response changed/);
    assert.equal(result.warmup.samples.length, 1);
    assert.equal(client.issued, 1);
  } finally { restore(); }
});


test("a failed memory probe preserves measured rows and issued counts", async () => {
  const restore = transport((index) => index === 1 ? 500 : 200);
  try {
    const result = await measure([{ variant: "node", url: "https://example.test" }], { secret: "test-only" });
    assert.equal(result.status, "failed");
    assert.equal(result.deployments.length, 1);
    const deployment = result.deployments[0];
    assert.equal(deployment.memoryAfterFirst.status, "failed");
    assert.match(deployment.memoryAfterFirst.error, /HTTP 500/);
    assert.equal(deployment.rows.length, 6);
    assert.equal(deployment.rows[0].status, "measured");
    assert(result.requestsIssued > 1000);
  } finally { restore(); }
});

const { cpuDelta } = await import("./cpu.mjs");
test("CPU windows retain instance changes as discarded and reject invalid counters", () => {
  const before = { instance: "a", pid: 1, cpu: { user: 1000, system: 2000 } };
  const after = { instance: "a", pid: 1, cpu: { user: 11000, system: 7000 } };
  assert.equal(cpuDelta(before, after, 100).cpuMsPerRequest, 0.15);
  assert.deepEqual(cpuDelta(before, { ...after, instance: "b" }, 100), { status: "discarded", reason: "instance-token-changed" });
  assert.throws(() => cpuDelta(before, { ...after, pid: 2 }, 100), /PID changed/);
  assert.throws(() => cpuDelta(before, { ...after, cpu: { user: 0, system: 7000 } }, 100), /nonmonotonic/);
  assert.throws(() => cpuDelta(before, { ...after, cpu: { user: NaN, system: 7000 } }, 100), /nonmonotonic/);
  assert.throws(() => cpuDelta(before, { ...after, instance: undefined }, 100), /instance token/);
});

test("CPU sampling keeps one pool per workload, repeats only token changes, and checks every digest", async () => {
  const { measureCpu } = await import("./cpu.mjs");
  const { workloads } = await import("./client.mjs");
  const original = https.request;
  let calls = 0, diagnostics = 0, work = 0;
  const agents = new Map();
  https.request = (url, options, callback) => {
    calls++;
    const isDiagnostic = url.pathname === "/api/diagnostics/memory";
    if (!isDiagnostic) {
      work++;
      const prior = agents.get(url.pathname);
      if (prior) assert.equal(options.agent, prior);
      agents.set(url.pathname, options.agent);
      assert.equal(options.agent.maxSockets, 1);
    }
    // First window changes token, all later boundaries are stable.
    const payload = isDiagnostic ? Buffer.from(JSON.stringify({ instance: diagnostics++ === 0 ? "old" : "stable", pid: 1,
      cpu: { user: work * 1000, system: 0 } })) : body;
    const req = new EventEmitter();
    req.reusedSocket = true;
    req.destroy = (error) => req.emit("error", error);
    req.end = () => queueMicrotask(() => {
      const res = new EventEmitter(); res.statusCode = 200;
      res.headers = { "x-vercel-cache": "MISS" };
      if (url.pathname === "/api/export.json.gz") Object.assign(res.headers, workloads.find((w) => w.id === "gzip-export").responseHeaders);
      callback(res);
      res.emit("data", url.pathname === "/api/export.json.gz" ? (awaitGzip(payload)) : payload);
      res.emit("end");
    });
    return req;
  };
  const { gzipSync: awaitGzip } = await import("node:zlib");
  try {
    const result = await measureCpu([{ variant: "node", url: "https://example.test" }], { secret: "test-only",
      references: Object.fromEntries(workloads.map((w) => [w.id, digest(body)])) });
    assert.equal(result.status, "complete");
    assert.equal(result.deployments[0].rows[0].attempts.length, 4);
    assert.equal(result.deployments[0].rows[0].attempts[0].status, "discarded");
    for (const row of result.deployments[0].rows) for (const attempt of row.attempts) {
      assert.equal(attempt.requests, 100);
      assert.equal(attempt.reusedRequests, 100);
      if (attempt.status === "accepted") assert.equal(attempt.cpuMsPerRequest, 1);
    }
    assert.equal(calls, result.requestsIssued);
    assert.equal(calls, 6 * (21 + 306) + 102);
  } finally { https.request = original; }
});
