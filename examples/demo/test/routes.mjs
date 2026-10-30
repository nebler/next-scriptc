import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { SignJWT, jwtVerify } from "jose";

const root = path.resolve(import.meta.dirname, "../../..");
const demo = path.join(root, "examples/demo");
const port = Number(process.env.ROUTES_PORT ?? "3427");
const clock = 1793318400;
const secret = "next-scriptc-parity-test-signing-secret-32-bytes";
const key = new TextEncoder().encode(secret);
const env = { ...process.env, NEXT_SCRIPTC_BASELINE: "", DEMO_JWT_NOW: String(clock), DEMO_JWT_SECRET: secret };
const running = new Set();
const relevantHeaders = ["content-type", "cache-control", "x-content-type-options", "www-authenticate"];

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
      server.once("error", reject);
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

async function responses(native) {
  const results = [];
  for (const test of cases) {
    const response = await fetch(`http://localhost:${port}${test.path}`, {
      method: test.method ?? "GET", headers: test.headers, body: test.body, signal: AbortSignal.timeout(180_000),
    });
    const body = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, test.status, `${test.path}: unexpected status; ${body.subarray(0, 256).toString()}`);
    assert.equal(response.headers.get("x-next-scriptc"), native ? "native" : null, test.path);
    await test.check?.(body);
    results.push({ status: response.status, headers: relevantHeaders.map((name) => [name, response.headers.get(name)]), body });
  }
  return results;
}

let ports = [port];
try {
  if (!process.argv.includes("--skip-build")) {
    const build = start(["build"]);
    assert.equal((await build.exit).code, 0, build.output);
    running.delete(build);
    console.log("Build passed.");
  }
  const manifest = JSON.parse(await readFile(path.join(demo, ".next/scriptc/manifest.json"), "utf8"));
  ports = [port, ...manifest.routes.map((route) => route.port)];
  await portsFree(ports);
  const dev = start(["dev", "-p", String(port)]);
  await ready(dev);
  const reference = await responses(false);
  await stop(dev);
  await portsFree(ports);
  console.log(`Node dev: ${cases.length} response cases passed.`);

  const production = start(["start", "-p", String(port)]);
  await ready(production);
  const actual = await responses(true);
  for (let i = 0; i < cases.length; i++) assert.deepEqual(actual[i], reference[i], `${cases[i].path}: dev/native status, headers and body bytes`);
  const pids = [...production.output.matchAll(/native PID (\d+)/g)].map((match) => Number(match[1]));
  assert.equal(pids.length, manifest.routes.length);
  await stop(production);
  for (const pid of pids) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  await portsFree(ports);
  console.log(`Native: ${cases.length} responses byte-equal (status, content/cache/security/auth headers and body); x-next-scriptc: native verified.`);
  console.log(`Cleanup passed: all ${pids.length} native processes exited; HTTP port ${port} and all native ports are free.`);
} catch (error) {
  for (const state of running) console.error(state.output.slice(-8000));
  throw error;
} finally {
  await Promise.allSettled([...running].map(stop));
  await portsFree(ports);
}
