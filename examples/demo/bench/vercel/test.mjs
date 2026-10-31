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
