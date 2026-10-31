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
