// Small hosted smoke suite; the 85-case route suite supplies workload parity.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const origins = { node: process.env.ROUTES_NODE_URL, native: process.env.ROUTES_NATIVE_URL };
assert.ok(origins.node && origins.native, "Set ROUTES_NODE_URL and ROUTES_NATIVE_URL");
const auth = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
  : { "x-vercel-trusted-oidc-idp-token": process.env.VERCEL_OIDC_TOKEN };
assert.ok(Object.values(auth)[0], "Load the protected deployment credentials from .env.local");
const requests = { node: 0, native: 0 };
const results = [];
const urlEcho = {};
async function request(variant, pathname, status = 200, native = false, headers = {}) {
  requests[variant]++;
  const response = await fetch(new URL(pathname, origins[variant]), {
    headers: { ...auth, ...headers }, redirect: "manual", signal: AbortSignal.timeout(90_000),
  });
  const body = await response.text();
  assert.equal(response.status, status, `${variant} ${pathname}: ${body.slice(0, 200)}`);
  assert.equal(response.headers.get("x-next-scriptc"), variant === "native" && native ? "native" : null);
  return { body, response };
}
async function check(label, run) {
  try {
    await run();
    results.push({ label, status: "PASS" });
    console.log(`PASS ${label}`);
  } catch (error) {
    results.push({ label, status: "FAIL", error: error.message });
    console.error(`FAIL ${label}: ${error.message}`);
  }
}
for (const variant of Object.keys(origins)) {
  await check(`${variant}: page and static assets`, async () => {
    const page = await request(variant, "/");
    assert.match(page.body, /<html/);
    const asset = page.body.match(/(?:src|href)="([^"?]*\/_next\/static\/[^"?]+\.js)(?:\?[^"]*)?"/);
    assert.ok(asset, "Home page references a JavaScript asset");
    const js = await request(variant, asset[1]);
    assert.match(js.response.headers.get("content-type"), /javascript/);
    await request(variant, "/favicon.ico");
    await request(variant, "/vercel.svg");
    await request(variant, "/missing-page", 404);
  });
  for (const [pathname, expected, native] of [
    ["/api/items/new", { node: "new item" }, false],
    ["/api/static-fixture", { fixture: "static" }, false],
    ["/rewrite/hello", { message: "Hello from next-scriptc!" }, true],
    ["/rewrite/items/a%20b", { id: "a b" }, true],
    ["/api/hello.rsc", { message: "Hello from next-scriptc!" }, true],
    ["/api/items/a%2Fb.rsc", { id: "a/b" }, true],
  ]) await check(`${variant}: ${pathname}`, async () => {
    const result = await request(variant, pathname, 200, native);
    assert.deepEqual(JSON.parse(result.body), expected);
  });
  await check(`${variant}: RSC header routing`, async () => {
    const result = await request(variant, "/api/hello", 200, true, { rsc: "1" });
    assert.deepEqual(JSON.parse(result.body), { message: "Hello from next-scriptc!" });
  });
  for (const suffix of ["", ".rsc"]) await check(`${variant}: URL echo${suffix}`, async () => {
    const pathname = `/api/url-echo${suffix}?q=a%20b&plus=a+b&dup=1&dup=2&slash=%2F&unicode=%E4%B8%96%E7%95%8C`;
    const result = await request(variant, pathname, 200, true);
    const publicURL = new URL(pathname, origins[variant]);
    publicURL.search = publicURL.searchParams.toString();
    const expected = { url: publicURL.href, host: publicURL.host };
    urlEcho[`${variant}${suffix}`] = JSON.parse(result.body);
    assert.deepEqual(urlEcho[`${variant}${suffix}`], expected);
  });
  await check(`${variant}: primes native route`, async () => {
    const result = await request(variant, "/api/primes?limit=100", 200, true);
    assert.equal(JSON.parse(result.body).count, 25);
  });
}
const reports = {};
for (const variant of Object.keys(origins)) await check(`${variant}: report worker route`, async () => {
  const result = await request(variant, "/api/report?threads=1", 200, true);
  reports[variant] = JSON.parse(result.body);
  assert.equal(reports[variant].sharedByReference, variant === "native");
  assert.equal(reports[variant].result.orders, 1_000_000);
});
await check("report deterministic results match", async () => {
  assert.ok(reports.node && reports.native);
  assert.deepEqual(reports.native.result, reports.node.result);
});
const destination = path.resolve(import.meta.dirname, "../../../.vercel/hosted-verification.json");
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, JSON.stringify({ origins, requests, results, urlEcho }, null, 2) + "\n");
console.log(`${results.filter((result) => result.status === "PASS").length}/${results.length} checks passed; requests ${JSON.stringify(requests)}`);
process.exitCode = results.some((result) => result.status === "FAIL") ? 1 : 0;
