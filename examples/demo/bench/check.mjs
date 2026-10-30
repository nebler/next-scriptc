// Focused harness regression checks; no application benchmark repetitions.
import assert from "node:assert/strict";
import http from "node:http";
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
    assert.equal(result.warmup.requests, 5);
    assert.equal(result.connectionsCreated, close ? 40 : 0);
    assert.equal(sockets, close ? 45 : 1);
    assert.equal(result.reusedRequests, close ? 0 : 40);
    await assert.rejects(load(base, { path: "/", digest: "wrong" }, { count: 1 }), /Response changed/);
    const concurrent = await load(base, { path: "/" }, { count: 43, concurrency: 8, warmupCount: 8 });
    assert.equal(concurrent.requests, 43);
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}
const parsed = parseCoverage(`statements analyzed 435\ncompile statically 430 (99%)\n in dynamic tier 201\n\n npm package compilation:\n   bcryptjs  static\n   jose  static\n\n diagnostics`);
assert.equal(parsed.dynamicTierStatements, 201);
assert.deepEqual(parsed.packages, [{ name: "bcryptjs", mode: "static" }, { name: "jose", mode: "static" }]);
assert.throws(() => parseCoverage("format changed"));
assert.deepEqual(sectionsOption("threads"), ["coverage", "threads"]);
assert.throws(() => sectionsOption("missing"));
assert.equal(productionCommand({ runtime: "native", nativeStart: "next", next: "next", cli: "cli", port: 123 })[0], "next");
console.log("Harness checks passed: warmed socket accounting (keep-alive and reconnect), exact counts at C=8, digest rejection, coverage parsing, section validation, centralized start command. All test sockets closed.");
