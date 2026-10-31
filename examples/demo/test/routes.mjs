import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { SignJWT, jwtVerify } from "jose";
import { createHash } from "node:crypto";
import { fixtureBody, uploadSha256 } from "../bench/fixtures.mjs";

const root = path.resolve(import.meta.dirname, "../../..");
const demo = path.join(root, "examples/demo");
const port = Number(process.env.ROUTES_PORT ?? "3427");
const clock = 1793318400;
const secret = "next-scriptc-parity-test-signing-secret-32-bytes";
const key = new TextEncoder().encode(secret);
const env = { ...process.env, NEXT_SCRIPTC_BASELINE: "", DEMO_PROXY_TIMEOUT_MS: "180000", DEMO_JWT_NOW: String(clock), DEMO_JWT_SECRET: secret };
const distDir = process.env.NEXT_SCRIPTC_DEMO_GROUPS === "light" ? ".next-grouped" : ".next";
const running = new Set();
const relevantHeaders = ["content-type", "cache-control", "x-content-type-options", "www-authenticate", "vary", "content-encoding", "content-disposition"];
const appVary = "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch";

function start(args) {
  const child = spawn("pnpm", ["--filter", "demo", ...args], { cwd: root, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const state = { child, output: "", listeners: new Set(), done: false };
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => {
    state.output += chunk;
    for (const listener of state.listeners) listener();
  });
  state.exit = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      state.done = true;
      resolve({ code, signal });
      for (const listener of state.listeners) listener();
    });
  });
  running.add(state);
  return state;
}

function ready(state) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`Server readiness timeout\n${state.output}`)), 120_000);
    function finish(error) {
      clearTimeout(timer);
      state.listeners.delete(check);
      if (error) reject(error); else resolve();
    }
    function check() {
      if (/Ready in/.test(state.output)) finish();
      else if (state.done) finish(new Error(`Server exited before readiness\n${state.output}`));
    }
    state.listeners.add(check);
    check();
  });
}

function killGroup(state, signal) {
  try { process.kill(-state.child.pid, signal); } catch (error) { if (error.code !== "ESRCH") throw error; }
}

async function stop(state) {
  if (!state.done) killGroup(state, "SIGTERM");
  const timer = setTimeout(() => killGroup(state, "SIGKILL"), 10_000);
  try { await state.exit; } finally { clearTimeout(timer); running.delete(state); }
}

for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.once(signal, () => {
    Promise.allSettled([...running].map(stop)).then(() => process.exit(code));
  });
}

async function portsFree(ports) {
  for (const number of ports) {
    const server = createServer();
    await new Promise((resolve, reject) => {
      server.once("error", (cause) => reject(new Error(`Route parity requires free port ${number}; stop the process using it before starting.`, { cause })));
      server.listen(number, "127.0.0.1", resolve);
    });
    await new Promise((resolve) => server.close(resolve));
  }
}

async function token(overrides = {}, signingKey = key) {
  return new SignJWT({ role: "editor", sub: "user-42", iss: "next-scriptc-demo", aud: "demo-api", iat: clock, exp: clock + 3600, ...overrides })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" }).sign(signingKey);
}

const validToken = await token();
const cases = [
  { path: "/api/login", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: " ADA@example.com ", password: "correct horse battery staple" }), status: 200, async check(body) {
    const result = JSON.parse(body);
    assert.equal(result.tokenType, "Bearer");
    assert.equal(result.expiresIn, 3600);
    const { payload } = await jwtVerify(result.accessToken, key, { issuer: "next-scriptc-demo", audience: "demo-api", algorithms: ["HS256"], currentDate: new Date(clock * 1000) });
    assert.equal(payload.sub, "user-42");
    assert.equal(payload.role, "editor");
    assert.equal(payload.iat, clock);
    assert.equal(payload.exp, clock + 3600);
  } },
  { path: "/api/login", method: "POST", body: JSON.stringify({ email: "ada@example.com", password: "wrong password" }), status: 401 },
  { path: "/api/login", method: "POST", body: JSON.stringify({ email: "missing@example.com", password: "correct horse battery staple" }), status: 401 },
  { path: "/api/login", method: "POST", body: "{", status: 400 },
  { path: "/api/login", method: "POST", body: "null", status: 400 },
  { path: "/api/login", method: "POST", body: "[]", status: 400 },
  { path: "/api/login", method: "POST", body: JSON.stringify({ email: 42, password: "password" }), status: 400 },
  { path: "/api/login", method: "POST", body: JSON.stringify({ email: "ada@example.com" }), status: 400 },
  { path: "/api/login", method: "POST", body: JSON.stringify({ email: "ada@example.com", password: "" }), status: 400 },
  { path: "/api/login", method: "POST", body: JSON.stringify({ email: "ada@example.com", password: 42 }), status: 400 },
  { path: "/api/login", method: "POST", body: JSON.stringify({ email: "ada@example.com", password: "é".repeat(37) }), status: 400 },
  { path: "/api/search?q=desk%20lamp&limit=7", status: 200, check(body) {
    const result = JSON.parse(body);
    assert.ok(result.total > 7);
    assert.equal(result.results.length, 7);
    assert.ok(result.results.every((product) => product.title.includes("Desk lamp")));
  } },
  { path: "/api/search?q=headset", status: 200 },
  { path: "/api/search?q=hedset", status: 200, check(body) { assert.ok(JSON.parse(body).total > 0); } },
  { path: "/api/search?q=zzzzzzzzzz", status: 200, check(body) { assert.equal(JSON.parse(body).total, 0); } },
  { path: "/api/search?q=", status: 200, check(body) { assert.deepEqual(JSON.parse(body).results, []); } },
  { path: "/api/search?q=lamp&limit=0", status: 400 },
  { path: "/api/search?q=lamp&limit=nope", status: 400 },
  { path: `/api/search?q=${"a".repeat(201)}`, status: 400 },
  { path: "/api/posts/reliable-webhooks", status: 200, check(body) {
    const html = body.toString();
    assert.ok(body.length > 10_000);
    assert.ok(html.includes("<table>") && html.includes("<pre><code") && html.includes("München"));
  } },
  { path: "/api/posts/catalog-search", status: 200 },
  { path: "/api/posts/missing", status: 404 },
  { path: "/api/feed.xml", status: 200, check(body) {
    const xml = body.toString();
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.equal((xml.match(/<item>/g) ?? []).length, 2);
    assert.ok(xml.includes("&lt;h1&gt;") && xml.includes("Field Notes &amp; Guides"));
  } },
  { path: "/api/verify", status: 401 },
  { path: "/api/verify", headers: { authorization: "Basic invalid" }, status: 401 },
  { path: "/api/verify", headers: { authorization: "Bearer malformed" }, status: 401 },
  { path: "/api/verify", headers: { authorization: `Bearer ${validToken}` }, status: 200, check(body) {
    assert.deepEqual(JSON.parse(body), { subject: "user-42", role: "editor", expiresAt: clock + 3600 });
  } },
  { path: "/api/verify", headers: { authorization: `Bearer ${await token({}, new TextEncoder().encode("wrong-signing-key-at-least-32-bytes"))}` }, status: 401 },
  { path: "/api/verify", headers: { authorization: `Bearer ${await token({ exp: clock - 1 })}` }, status: 401 },
  { path: "/api/verify", headers: { authorization: `Bearer ${await token({ nbf: clock + 60 })}` }, status: 401 },
  { path: "/api/verify", headers: { authorization: `Bearer ${await token({ iss: "another-issuer" })}` }, status: 401 },
  { path: "/api/verify", headers: { authorization: `Bearer ${await token({ aud: "another-api" })}` }, status: 401 },
  { path: "/api/verify", headers: { authorization: `Bearer ${await token({ exp: undefined })}` }, status: 401 },
];

// Both password algorithms share the successful JWT/validation cases. Scrypt
// has no bcrypt 72-byte truncation limit; its explicit input bound is 1024 bytes.
for (const test of cases.filter((test) => test.path === "/api/login")) {
  cases.push({ ...test, path: "/api/login-scrypt",
    ...(test.body?.includes("é") ? { body: JSON.stringify({ email: "ada@example.com", password: "é".repeat(513) }) } : {}) });
}
cases.push(
  { path: "/api/login-scrypt", method: "POST", body: JSON.stringify({ email: "ada@example.com", password: "é".repeat(37) }), status: 401 },
  { path: "/api/hello", status: 200, check(body) { assert.equal(JSON.parse(body).message, "Hello from next-scriptc!"); } },
  { path: "/api/hello", headers: { "accept-language": "de" }, status: 200, check(body) { assert.equal(JSON.parse(body).message, "Hallo von next-scriptc!"); } },
  { path: "/api/feed.xml?limit=1", status: 200, check(body) { assert.equal((body.toString().match(/<item>/g) ?? []).length, 1); } },
  { path: "/api/feed.xml?limit=0", status: 400 },
);

const upload = fixtureBody("upload-1mib");
const image = fixtureBody("rgba-512");
const integrityHeaders = { "content-type": "application/octet-stream", "x-content-sha256": uploadSha256 };
cases.push(
  { path: "/api/uploads/verify", method: "POST", headers: integrityHeaders, body: upload, status: 200, check(body) {
    assert.deepEqual(JSON.parse(body), { verified: true, sha256: uploadSha256, bytes: upload.length });
  } },
  { path: "/api/uploads/verify", method: "POST", headers: { "x-content-sha256": "0".repeat(64) }, body: upload, status: 422 },
  { path: "/api/uploads/verify", method: "POST", body: "abc", status: 400 },
  { path: "/api/uploads/verify", method: "POST", headers: { "x-content-sha256": "nope" }, status: 400 },
  { path: "/api/uploads/verify", method: "POST", headers: { "x-content-sha256": createHash("sha256").update("").digest("hex").toUpperCase() }, body: "", status: 200 },
  { path: "/api/uploads/verify", method: "POST", headers: integrityHeaders, body: Buffer.alloc(4 * 1024 * 1024 + 1), status: 413 },
  { path: "/api/export.json.gz?rows=5000", status: 200, gzip: true, check(body) {
    const rows = JSON.parse(body).rows;
    assert.equal(rows.length, 5000);
    assert.deepEqual(rows[0], { id: "invoice-1", region: "region-0", amountCents: 100, quantity: 1 });
    assert.equal(rows[4999].id, "invoice-5000");
  } },
  { path: "/api/export.json.gz?rows=1", status: 200, gzip: true, check(body) { assert.equal(JSON.parse(body).rows.length, 1); } },
  ...["0", "5001", "nope", "1.5"].map((rows) => ({ path: `/api/export.json.gz?rows=${rows}`, status: 400 })),
  { path: "/api/analytics/revenue?from=2026-01-01&to=2026-01-31", status: 200, check(body) {
    const result = JSON.parse(body);
    let expected = 0;
    for (let i = 0; i < 5000; i++) expected += (100 + (i * 7919) % 49900) * (1 + i % 5);
    assert.equal(result.events, 5000);
    assert.equal(result.revenueCents, expected);
    assert.equal(result.daily.length, 31 * 8);
    assert.equal(result.daily.reduce((sum, day) => sum + day.revenueCents, 0), expected);
  } },
  { path: "/api/analytics/revenue?from=2026-01-10&to=2026-01-10", status: 200, check(body) {
    const result = JSON.parse(body);
    let expected = 0;
    let count = 0;
    for (let i = 0; i < 5000; i++) if (i % 31 === 9) { expected += (100 + (i * 7919) % 49900) * (1 + i % 5); count++; }
    assert.equal(result.events, count);
    assert.equal(result.revenueCents, expected);
    assert.ok(result.daily.every((day) => day.day === "2026-01-10"));
  } },
  { path: "/api/analytics/revenue?from=2027-01-01&to=2027-01-31", status: 200, check(body) { assert.deepEqual(JSON.parse(body).daily, []); } },
  ...["from=2026-02-30", "from=nope", "from=2026-02-01&to=2026-01-01"].map((query) => ({ path: `/api/analytics/revenue?${query}`, status: 400 })),
  { path: "/api/images/histogram?width=512&height=512", method: "POST", body: image, status: 200, check(body) {
    const result = JSON.parse(body);
    const histogram = Array(256).fill(0);
    for (let i = 0; i < image.length; i += 4) histogram[(77 * image[i] + 150 * image[i + 1] + 29 * image[i + 2]) >>> 8]++;
    assert.deepEqual(result.histogram, histogram);
    assert.equal(result.pixels, 512 * 512);
    assert.equal(result.mean, histogram.reduce((sum, count, luma) => sum + count * luma, 0) / result.pixels);
    assert.equal(result.min, histogram.findIndex((count) => count > 0));
    assert.equal(result.max, histogram.findLastIndex((count) => count > 0));
  } },
  { path: "/api/images/histogram?width=2&height=1", method: "POST", body: Buffer.from([0, 0, 0, 0, 255, 255, 255, 255]), status: 200, check(body) {
    const result = JSON.parse(body);
    assert.equal(result.min, 0); assert.equal(result.max, 255); assert.equal(result.mean, 127.5);
    assert.equal(result.histogram[0], 1); assert.equal(result.histogram[255], 1);
  } },
  ...["width=0&height=1", "width=1.5&height=1", "width=1025&height=1024", "width=nope&height=1", ""].map((query) => ({ path: `/api/images/histogram?${query}`, method: "POST", body: image, status: 400 })),
  { path: "/api/images/histogram?width=2&height=2", method: "POST", body: "short", status: 400 },
  { path: "/api/stores/nearby?lat=51.5074&lng=-0.1278&radiusKm=1000", status: 200, check(body) {
    const result = JSON.parse(body);
    assert.ok(result.total >= 20);
    assert.equal(result.stores.length, 20);
    for (let i = 0; i < result.stores.length; i++) {
      const store = result.stores[i];
      assert.ok(Number.isInteger(store.distanceMetres) && store.distanceMetres <= 1000000);
      if (i) assert.ok(store.distanceMetres > result.stores[i - 1].distanceMetres ||
        (store.distanceMetres === result.stores[i - 1].distanceMetres && store.id > result.stores[i - 1].id));
    }
  } },
  { path: "/api/stores/nearby?lat=-85&lng=-179&radiusKm=0.001", status: 200, check(body) {
    assert.deepEqual(JSON.parse(body).stores, [{ id: 1, name: "Store 1", distanceMetres: 0 }]);
  } },
  { path: "/api/stores/nearby?lat=90&lng=180&radiusKm=0.001", status: 200, check(body) { assert.equal(JSON.parse(body).total, 0); } },
  ...["lat=91&lng=0", "lat=0&lng=-181", "lat=nope&lng=0", "lat=0", "lat=&lng=0", "lat=0&lng=0&radiusKm=0", "lat=0&lng=0&radiusKm=20001"].map((query) => ({ path: `/api/stores/nearby?${query}`, status: 400 })),
);

async function responses(native) {
  const results = [];
  for (const test of cases) {
    const response = await fetch(`http://localhost:${port}${test.path}`, {
      method: test.method ?? "GET", headers: { "accept-encoding": "identity", ...test.headers }, body: test.body, signal: AbortSignal.timeout(180_000),
    });
    // fetch validates and decompresses gzip. Compare these decoded bytes and
    // the representation headers, allowing different valid compressed streams.
    const body = Buffer.from(await response.arrayBuffer());
    if (test.gzip) {
      assert.equal(response.headers.get("content-encoding"), "gzip");
      assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
      assert.equal(response.headers.get("content-disposition"), 'attachment; filename="export.json.gz"');
    }
    assert.equal(response.status, test.status, `${test.path}: unexpected status; ${body.subarray(0, 256).toString()}`);
    assert.equal(response.headers.get("x-next-scriptc"), native ? "native" : null, test.path);
    await test.check?.(body);
    results.push({ status: response.status, headers: relevantHeaders.map((name) => [name, response.headers.get(name)]), body });
  }
  return results;
}

let ports = [port];
try {
  await portsFree(ports);
  if (!process.argv.includes("--skip-build")) {
    const build = start(["build"]);
    assert.equal((await build.exit).code, 0, build.output);
    running.delete(build);
    console.log("Build passed.");
  }
  const manifest = JSON.parse(await readFile(path.join(demo, distDir, "scriptc/manifest.json"), "utf8"));
  ports = [port, ...manifest.routes.map((route) => route.port)];
  await portsFree(ports);
  const dev = start(["dev", "-p", String(port)]);
  await ready(dev);
  const reference = await responses(false);
  await stop(dev);
  await portsFree(ports);
  console.log(`Node dev: ${cases.length} response cases passed.`);

  const production = start(["start", "-p", String(port)]);
  console.log("Native parity uses a test-only 180s proxy timeout for cost-10 bcrypt on loaded hosts.");
  await ready(production);
  const actual = await responses(true);
  for (let i = 0; i < cases.length; i++) {
    const expectedVary = reference[i].headers.find(([name]) => name === "vary");
    const actualVary = actual[i].headers.find(([name]) => name === "vary");
    assert.ok(expectedVary[1] === appVary || expectedVary[1]?.startsWith(`${appVary}, `), `${cases[i].path}: Next App Route Vary prefix`);
    // External rewrites pass through Next's compression middleware (see
    // research/adapter-notes.md). Only its appended token may differ.
    assert.ok(actualVary[1] === expectedVary[1] || actualVary[1] === `${expectedVary[1]}, Accept-Encoding`, `${cases[i].path}: native Vary: ${actualVary[1]}`);
    actualVary[1] = expectedVary[1];
    assert.deepEqual(actual[i], reference[i], `${cases[i].path}: dev/native status, headers and body bytes`);
  }
  const pids = [...production.output.matchAll(/native PID (\d+)/g)].map((match) => Number(match[1]));
  assert.equal(pids.length, manifest.processes.length);
  await stop(production);
  for (const pid of pids) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  await portsFree(ports);
  console.log(`Native: ${cases.length} responses match status, content/cache/security/auth headers and body bytes (decompressed for gzip); Vary matches except optional compression Accept-Encoding; x-next-scriptc: native verified.`);
  console.log(`Cleanup passed: all ${pids.length} native processes exited; HTTP port ${port} and all native ports are free.`);
} catch (error) {
  for (const state of running) console.error(state.output.slice(-8000));
  throw error;
} finally {
  await Promise.allSettled([...running].map(stop));
  await portsFree(ports);
}
