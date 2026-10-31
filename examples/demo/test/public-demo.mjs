import test from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { AsyncLocalStorage } from "node:async_hooks";
import { execFileSync } from "node:child_process";
import { config, proxy } from "../proxy.ts";

globalThis.AsyncLocalStorage = AsyncLocalStorage;
// Next 16.4.3 still exports this helper under its former middleware name.
const { unstable_doesMiddlewareMatch } = await import("next/experimental/testing/server.js");
const matches = (url) => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });
const allowed = new Set(["/api/hello", "/api/analytics/revenue", "/api/stores/nearby", "/api/heavy/vectors"]);

test("public matcher denies every other discovered API and future APIs, without a proxy hop on allowed routes", async () => {
  const files = await readdir(new URL("../app/api", import.meta.url), { recursive: true });
  for (const file of files.filter((file) => /(^|\/)route\.(native\.)?ts$/.test(file))) {
    const pattern = `/api/${file.replace(/\/route\.(native\.)?ts$/, "")}`;
    const route = pattern.replace(/\[[^\]]+\]/g, "fixture");
    for (const suffix of ["", "/", "?fixture=1"]) assert.equal(matches(route + suffix), !allowed.has(route), route + suffix);
  }
  for (const route of ["/api/future", "/api/hello/extra", "/api/heavy/vectors-imul", "/api/diagnostics/memory.rsc", "/api/app/orders.rsc", "/rewrite/items/42", "/rewrite/hello"]) {
    assert.equal(matches(route), true, route);
  }
  for (const route of ["/", "/reports", "/reports?size=200000", "/_next/static/chunk.js", "/favicon.ico"]) assert.equal(matches(route), false, route);
});

test("proxy opt-in returns a plain 404, ordinary dev/test/benchmark builds pass through", async () => {
  const previous = process.env.NEXT_SCRIPTC_PUBLIC_DEMO;
  try {
    for (const value of [undefined, "0", "true"]) {
      if (value === undefined) delete process.env.NEXT_SCRIPTC_PUBLIC_DEMO;
      else process.env.NEXT_SCRIPTC_PUBLIC_DEMO = value;
      assert.equal(proxy(), undefined);
    }
    process.env.NEXT_SCRIPTC_PUBLIC_DEMO = "1";
    const result = proxy();
    assert.equal(result.status, 404);
    assert.equal(await result.text(), "Not Found");
    assert.equal(result.headers.get("content-type"), "text/plain; charset=utf-8");
  } finally {
    if (previous === undefined) delete process.env.NEXT_SCRIPTC_PUBLIC_DEMO;
    else process.env.NEXT_SCRIPTC_PUBLIC_DEMO = previous;
  }
});

test("public vector observations expose timing and dispatch without benchmark process details", () => {
  const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
    import { POST } from './app/api/heavy/vectors/route.native.ts';
    const response = await POST(new Request('http://localhost/api/heavy/vectors', {
      method: 'POST', body: JSON.stringify({embedding: Array(768).fill(0)})
    }));
    console.log(JSON.stringify({status: response.status, headers: Object.fromEntries(response.headers)}));
  `], {
    cwd: new URL("..", import.meta.url), encoding: "utf8",
    env: { ...process.env, NEXT_SCRIPTC_PUBLIC_DEMO: "1", VECTOR_VERCEL_TIMING: "1", VECTOR_DISPATCH_ADDRESS: "" },
  }));
  assert.equal(result.status, 200);
  assert.match(result.headers["server-timing"], /^compute;dur=\d/);
  assert.equal(result.headers["x-vector-dispatch"], "unknown");
  for (const header of ["x-vector-cpu-us", "x-vector-rss", "x-vector-instance"]) assert.equal(result.headers[header], undefined);
});
