import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { test } from "node:test";

const directory = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(directory, "entry.ts");
const compiler = path.resolve(directory, "../../node_modules/.bin/scriptc");
const processes = new Set();
let comparisons = 0;

// Use Next's real decision independently of the serve.ts shared by both peers.
function nextVary(pathname, interceptionPatterns = []) {
  const require = createRequire(import.meta.url);
  const { default: BaseServer } = require("next/dist/server/base-server.js");
  const server = Object.create(BaseServer.prototype);
  server.interceptionRoutePatterns = interceptionPatterns.map((value) => new RegExp(value));
  const req = { headers: { "next-url": "/source" } };
  const headers = {};
  server.setVaryHeader(req, { appendHeader(name, value) { headers[name] = value; } }, true, pathname);
  return { vary: headers.vary, nextUrl: req.headers["next-url"] ?? null };
}

function start(command, args, env = {}) {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
  const state = { child, stdout: "", stderr: "", exited: false, waiters: new Set() };
  processes.add(state);
  child.stdout.on("data", (data) => {
    state.stdout += data;
    for (const notify of state.waiters) notify();
  });
  child.stderr.on("data", (data) => { state.stderr += data; });
  state.exit = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      state.exited = true;
      resolve({ code, signal });
      for (const notify of state.waiters) notify();
    });
  });
  // The failure is surfaced by readiness or the exit assertion below.
  state.exit.catch(() => {});
  return state;
}

function waitForOutput(state, expression) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error(`Timed out waiting for ${expression}\n${state.stdout}\n${state.stderr}`)), 30_000);
    function finish(error, match) {
      clearTimeout(timeout);
      state.waiters.delete(check);
      if (error) reject(error);
      else resolve(match);
    }
    function check() {
      const match = state.stdout.match(expression);
      if (match) finish(null, match);
      else if (state.exited) finish(new Error(`Process exited before readiness\n${state.stdout}\n${state.stderr}`));
    }
    state.waiters.add(check);
    state.exit.catch((error) => finish(error));
    check();
  });
}

async function stop(state, signal = "SIGTERM") {
  if (!state.exited) state.child.kill(signal);
  let timer;
  try {
    return await Promise.race([
      state.exit,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          state.child.kill("SIGKILL");
          reject(new Error(`Process did not exit on ${signal}\n${state.stderr}`));
        }, 10_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    processes.delete(state);
  }
}

function request(port, specification) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request({
      host: "127.0.0.1", port, path: specification.path,
      method: specification.method || "GET", agent: false,
      headers: { host: "fixture.test:4321", ...specification.headers },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => {
        const headers = { ...response.headers };
        delete headers.date;
        const runtime = headers["x-next-scriptc"];
        delete headers["x-next-scriptc"];
        resolve({ status: response.statusCode, statusText: response.statusMessage, headers, body: Buffer.concat(chunks), runtime });
      });
    });
    outgoing.setTimeout(10_000, () => outgoing.destroy(new Error("HTTP request timed out")));
    outgoing.on("error", reject);
    if (specification.chunks) {
      for (const chunk of specification.chunks) outgoing.write(chunk);
      outgoing.end();
    } else outgoing.end(specification.body);
  });
}

async function assertAbortedUpload(port, state) {
  const offset = state.stderr.length;
  await new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: "/api/a", method: "POST", agent: false,
      headers: { "content-length": "1048576" } });
    req.on("error", () => {});
    req.on("close", resolve);
    req.on("socket", (socket) => socket.once("connect", () => {
      req.write("partial");
      setTimeout(() => req.destroy(), 30);
    }));
    req.setTimeout(5000, () => { req.destroy(); reject(new Error("Aborted upload did not close")); });
  });
  const deadline = performance.now() + 5000;
  while (!/aborted/i.test(state.stderr.slice(offset)) && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.match(state.stderr.slice(offset), /aborted/i);
}

async function assertCancellation(port, path, state) {
  await new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path, agent: false }, (res) => {
      res.once("data", () => { res.destroy(); resolve(); });
      res.on("error", () => {});
    });
    req.on("error", reject);
  });
  await waitForOutput(state, /shim fixture: stream cancelled/);
}

async function assertKeepAlive(port, path) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const sockets = [];
  try {
    for (let i = 0; i < 2; i++) await new Promise((resolve, reject) => {
      const req = http.get({ host: "127.0.0.1", port, path, agent }, (res) => {
        assert.equal(res.headers["keep-alive"], "timeout=60");
        res.resume();
        res.on("end", resolve);
        res.on("error", reject);
      });
      req.on("socket", (socket) => sockets.push(socket));
      req.on("error", reject);
    });
    assert.equal(sockets[0], sockets[1], "two requests reuse one connection");
  } finally { agent.destroy(); }
}

async function assertStreaming(port, path) {
  const started = performance.now();
  let first;
  const chunks = [];
  await new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path, agent: false }, (response) => {
      response.on("data", (chunk) => {
        first ??= performance.now();
        chunks.push(chunk);
      });
      response.on("end", resolve);
      response.on("error", reject);
    }).on("error", reject);
  });
  const end = performance.now();
  assert.equal(chunks[0].toString(), "first:", "first chunk arrives separately");
  assert.equal(Buffer.concat(chunks).toString(), "first:世界:last");
  assert.ok(end - first >= 140, `stream buffered: first=${first - started}ms end=${end - started}ms`);
  console.log(`Streaming port ${port}: first ${(first - started).toFixed(1)}ms, end ${(end - started).toFixed(1)}ms`);
}

async function pair(binary, env, run, signal = "SIGTERM") {
  const node = start(process.execPath, ["--import", path.join(directory, "node-next-server.mjs"), entry], { PORT: "0", ...env });
  const native = start(binary, [], { PORT: "0", ...env });
  try {
    const readiness = /next-scriptc: listening on 127\.0\.0\.1:(\d+)/;
    const matches = await Promise.all([waitForOutput(node, readiness), waitForOutput(native, readiness)]);
    const ports = matches.map((match) => Number(match[1]));
    assert.notEqual(ports[0], ports[1]);
    async function compare(specification) {
      const [reference, actual] = await Promise.all(ports.map((port) => request(port, specification)));
      assert.equal(reference.runtime, "1");
      assert.equal(actual.runtime, "native");
      const { runtime: nodeRuntime, ...expected } = reference;
      const { runtime: nativeRuntime, ...result } = actual;
      assert.deepEqual(result, expected, `${specification.method || "GET"} ${specification.path}\n${native.stderr}`);
      comparisons++;
      if (specification.status) assert.equal(actual.status, specification.status);
      if (specification.text !== undefined) assert.equal(actual.body.toString(), specification.text);
      if (specification.json) assert.deepEqual(JSON.parse(actual.body.toString()), specification.json);
      if (specification.allow) assert.equal(actual.headers.allow, specification.allow);
      return actual;
    }
    await run(compare, { node, native, ports });
    for (const state of [node, native]) {
      assert.deepEqual(await stop(state, signal), { code: 0, signal: null });
      assert.equal((state.stdout.match(/next-scriptc: listening/g) || []).length, 1);
    }
  } finally {
    await Promise.allSettled([stop(node), stop(native)]);
  }
}

test("shim HTTP parity: Node 24 and scriptc native", { timeout: 360_000 }, async () => {
  assert.equal(Number(process.versions.node.split(".")[0]), 24, "Run with Node 24 (for example pnpm --package=node@24 dlx node shim/test/parity.mjs)");
  const temporary = await mkdtemp(path.join(directory, ".parity-"));
  const binary = path.join(temporary, "server");
  const upstream = http.createServer((_request, response) => {
    const body = gzipSync("decoded upstream 世界");
    response.writeHead(200, { "content-encoding": "gzip" });
    response.end(body);
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  try {
    const nativeEntry = path.join(temporary, "entry.ts");
    await writeFile(nativeEntry, `import ${JSON.stringify(entry)};\n`);
    await writeFile(path.join(temporary, "tsconfig.json"), JSON.stringify({ compilerOptions: {
      strict: true, allowImportingTsExtensions: true, noEmit: true,
      types: ["node"], typeRoots: [path.resolve(directory, "../../../../examples/demo/node_modules/@types")],
      paths: { "next/server": [path.resolve(directory, "../next-server.ts")] },
    } }));
    const build = start(compiler, ["build", nativeEntry, "-o", binary, "--no-keep-llvm"]);
    const result = await build.exit;
    processes.delete(build);
    assert.equal(result.code, 0, `${build.stdout}\n${build.stderr}`);
    await pair(binary, { SHIM_DELAY_INIT: "1" }, async (compare) => {
      const started = performance.now();
      await Promise.all(Array.from({ length: 3 }, () => compare({ path: "/api/a?case=text", status: 200, text: "hello, 世界\n" })));
      assert.ok(performance.now() - started >= 180, "early requests await route-module initialization");
    });
    for (const grouped of ["", "1"]) await pair(binary, { SHIM_VERCEL: "1", SHIM_GROUPED: grouped, SHIM_DELAY_INIT: "1" }, async (compare, { node, native }) => {
      for (const state of [node, native]) assert.doesNotMatch(state.stdout, /fixture: .*loader/, "Vercel readiness does not initialize route modules");
      if (grouped) {
        await compare({ path: "/api/static", status: 200, text: "static" });
        for (const state of [node, native]) assert.doesNotMatch(state.stdout, /fixture: .*loader/, "a request does not initialize unrelated modules");
      }
      const started = performance.now();
      await Promise.all(Array.from({ length: 3 }, () => compare({ path: "/api/a?case=text", status: 200, text: "hello, 世界\n" })));
      assert.ok(performance.now() - started >= 180, "concurrent first requests await initialization");
      await compare({ path: "/api/a", method: "OPTIONS", status: 204, allow: "GET, HEAD, OPTIONS, PATCH, POST, PUT" });
      for (const state of [node, native]) {
        assert.equal((state.stdout.match(/fixture: route-loader/g) || []).length, 1, "load once across concurrent and later requests");
        assert.doesNotMatch(state.stdout, /fixture: pending-loader/);
      }
    });
    for (const grouped of ["", "1"]) await pair(binary, { SHIM_VERCEL: "1", SHIM_GROUPED: grouped }, async (compare) => {
      const headers = { "x-matched-path": "/api/hello.rsc", "x-forwarded-host": "public.test", "x-forwarded-proto": "https" };
      const rewritten = await compare({ path: "/rewritten?case=url&q=a%20b&nxtPid=hello", headers,
        status: 200, json: { url: "https://public.test/rewritten?case=url&q=a+b", host: "public.test" } });
      assert.equal(rewritten.headers.vary, undefined, "Vercel minimal mode omits the App Route Vary prefix");
      await compare({ path: "/api/hello.rsc?case=url", headers, status: 200,
        json: { url: "https://public.test/api/hello.rsc?case=url", host: "public.test" } });
      const dynamic = await compare({ path: "/rewritten?nxtPid=a%2Fb&nxtPslug=one%2Ftwo", headers: { "x-matched-path": "/api/[id]/[[...slug]]" }, status: 200 });
      assert.deepEqual(JSON.parse(dynamic.body).params, { id: "a/b", slug: ["one", "two"] });
      assert.equal(JSON.parse(dynamic.body).query, "");
    });
    await pair(binary, { SHIM_GROUPED: "1", SHIM_DELAY_INIT: "1", SHIM_INTERCEPTION: "1" }, async (compare, { ports }) => {
      await compare({ path: "/api/static", status: 200, text: "static" });
      await compare({ path: "/api/a?case=text", status: 200, text: "hello, 世界\n" });
      const dynamic = await compare({ path: "/api/hello%20world/a%2Fb/" });
      assert.deepEqual(JSON.parse(dynamic.body).params, { id: "hello world", slug: ["a/b"] });
      for (const pathname of ["/api/intercepted", "/api/ordinary"]) {
        const expected = nextVary(pathname, ["^/api/intercepted(?:/|$)"]);
        const response = await compare({ path: `${pathname}?case=next-url`, headers: { "next-url": "/source" }, json: { nextUrl: expected.nextUrl } });
        assert.equal(response.headers.vary, expected.vary);
      }
      await compare({ path: "/api/a", method: "POST", body: JSON.stringify({ value: "group" }), status: 201 });
      await compare({ path: "/api/a?case=text", method: "HEAD", status: 200, text: "" });
      const allow = "GET, HEAD, OPTIONS, PATCH, POST, PUT";
      await compare({ path: "/api/a", method: "OPTIONS", status: 204, allow });
      await compare({ path: "/api/a", method: "DELETE", status: 405, allow });
      await compare({ path: "/api/%E0%A4%A", status: 400 });
      await compare({ path: "/missing", status: 404 });
      for (const port of ports) await assertStreaming(port, "/api/a?case=slow");
    });
    await pair(binary, { SHIM_UPSTREAM: `http://127.0.0.1:${upstream.address().port}` }, async (compare, { node, native, ports }) => {
      for (const port of ports) await assertStreaming(port, "/api/a?case=next-stream");
      const allow = "GET, HEAD, OPTIONS, PATCH, POST, PUT";
      const base = "/api/hello";
      const json = {
        params: { id: "hello" }, method: "GET", pathname: base,
        query: "?q=a%20b&q=two&plus=a+b", host: "fixture.test:4321",
        repeated: "one, two", cookie: "a=1; b=2", requestCookies: ["request=one", "request=two"],
      };
      await compare({ path: `${base}${json.query}`, status: 200, json, headers: { "x-repeated": ["one", "two"], cookie: ["a=1", "b=2"], "set-cookie": ["request=one", "request=two"] } });
      await compare({ path: `${base}?case=url`, json: { url: `https://public.test:8443${base}?case=url`, host: "public.test:8443" }, headers: { "x-forwarded-host": "public.test:8443", "x-forwarded-proto": "https" } });
      await compare({ path: `${base}?case=url&q=a%20b&q=two&plus=a+b`, json: { url: `https://public.test:8443${base}?case=url&q=a+b&q=two&plus=a+b`, host: "public.test:8443" }, headers: { "x-forwarded-host": "public.test:8443", "x-forwarded-proto": "https" } });
      for (const host of ["127.0.0.2:4321", "[::1]:4321"]) {
        await compare({ path: `${base}?case=url`, headers: { host }, json: { url: `http://localhost:4321${base}?case=url`, host } });
      }
      await compare({ path: `${base}?case=request-lazy`, headers: { cookie: "theme=original" }, json: {
        sameHeaders: true, sameSignal: true, cloned: "after", bodyUsed: false,
        cookie: { name: "theme", value: "original" }, url: `http://fixture.test:4321${base}?case=request-lazy`, method: "GET",
      } });
      await compare({ path: `${base}?case=next-cookie-snapshot`, headers: { cookie: "theme=original" }, json: { theme: { name: "theme", value: "original" } } });
      const appVary = "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch";
      for (const value of ["accept-language", "*", appVary, "RSC, accept-language"]) {
        const result = await compare({ path: `${base}?case=vary&value=${encodeURIComponent(value)}` });
        assert.equal(result.headers.vary, value === appVary ? appVary : `${appVary}, ${value}`);
      }
      const expected = nextVary(base);
      const nextUrl = await compare({ path: `${base}?case=next-url`, headers: { "next-url": "/source" }, json: { nextUrl: expected.nextUrl } });
      assert.equal(nextUrl.headers.vary, expected.vary);
      const single = await compare({ path: `${base}?case=next-typed`, json: { typed: true } });
      assert.equal(single.headers["content-length"], "14", "single chunk uses end(bytes)");
      assert.equal(single.headers["transfer-encoding"], undefined);
      const percent = await compare({ path: `${base}?case=next-cookie-percent`, status: 200, text: "cookie" });
      assert.deepEqual(percent.headers["set-cookie"], ["initial=%25", "other=value; Path=/"]);
      await compare({ path: `${base}?case=next-cookie-percent-invalid`, status: 500, text: "" });
      const next = await compare({ path: `${base}?case=next-json&q=one&q=two`, status: 201,
        headers: { cookie: "theme=light; bare; theme=dark%20mode; broken=%FF; eq=a=b; empty=", "x-fixture": "read" } });
      assert.deepEqual(JSON.parse(next.body), {
        pathname: base, query: ["one", "two"], theme: { name: "theme", value: "dark mode" },
        flags: [{ name: "theme", value: "dark mode" }, { name: "bare", value: "true" }, { name: "eq", value: "a=b" }, { name: "empty", value: "" }],
        selected: [{ name: "theme", value: "dark mode" }], missing: [], has: true, header: "read",
      });
      assert.deepEqual(next.headers["set-cookie"], [
        "initial=one; HttpOnly; SameSite=lax", "theme=updated; Path=/; HttpOnly",
        "second=two; Path=/account; Expires=Wed, 21 Oct 2037 07:28:00 GMT; Max-Age=0; Domain=fixture.test",
        "flags=hello%20%E4%B8%96%E7%95%8C; Secure; HttpOnly; SameSite=true; Partitioned; Priority=high",
        "gone=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
        "scoped=; Path=/account; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Domain=fixture.test; Secure",
      ]);
      const redirect = await compare({ path: `${base}?case=next-redirect`, status: 307, text: "" });
      assert.equal(redirect.headers.location, "http://fixture.test:4321/destination?q=%E4%B8%96%E7%95%8C");
      await compare({ path: `${base}?case=next-redirect-302`, status: 302, text: "" });
      await compare({ path: `${base}?case=next-invalid-redirect`, status: 500, text: "" });
      await compare({ path: `${base}?case=next-body`, status: 202, text: "constructed:世界" });
      for (const [index, port] of ports.entries()) await assertCancellation(port, `${base}?case=cancel`, [node, native][index]);
      for (const [index, port] of ports.entries()) await assertAbortedUpload(port, [node, native][index]);
      for (const port of ports) await assertKeepAlive(port, base);
      for (const port of ports) await assertStreaming(port, `${base}?case=slow`);
      const framing = await compare({ path: `${base}?case=framing`, text: "decoded" });
      assert.equal(framing.headers.connection, "x-hop");
      assert.equal(framing.headers["x-hop"], "preserve");
      assert.equal(framing.headers["keep-alive"], "timeout=5");
      assert.equal(framing.headers["proxy-authenticate"], "Basic");
      assert.equal(framing.headers["x-middleware-set-cookie"], undefined);
      assert.equal(framing.headers["content-length"], "7");
      const chunked = await compare({ path: `${base}?case=chunked`, text: "chunked" });
      assert.equal(chunked.headers["transfer-encoding"], "chunked");
      const fetched = await compare({ path: `${base}?case=fetch`, text: "decoded upstream 世界" });
      assert.equal(fetched.headers["content-encoding"], "gzip");
      const encoded = await compare({ path: `${base}?case=encoded` });
      assert.equal(encoded.headers["content-encoding"], "gzip");
      assert.deepEqual(encoded.body, Buffer.from([1, 2, 3]));
      await compare({ path: `${base}?case=text`, text: "hello, 世界\n", status: 200 });
      const binaryResponse = await compare({ path: `${base}?case=binary` });
      assert.deepEqual(binaryResponse.body, Buffer.from([0, 1, 127, 128, 255]));
      const cookies = await compare({ path: `${base}?case=cookies` });
      assert.deepEqual(cookies.headers["set-cookie"], ["first=one; Path=/; HttpOnly", "second=two; Expires=Wed, 21 Oct 2037 07:28:00 GMT"]);
      await compare({ path: `${base}?case=missing`, status: 404, text: "not found" });
      await compare({ path: `${base}?case=empty`, status: 204, text: "" });
      await compare({ path: `${base}?case=stream`, status: 200, text: "first:世界:last" });
      await compare({ path: base, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: [1, "世界", true] }), status: 201, json: { method: "POST", body: { value: [1, "世界", true] } } });
      const posted = await compare({ path: `${base}?case=binary`, method: "POST", chunks: [Buffer.from([0, 255]), Buffer.from([128, 1])], headers: { "content-type": "application/octet-stream" } });
      assert.deepEqual(posted.body, Buffer.from([0, 255, 128, 1]));
      for (const payload of ["", "hello 世界", "x".repeat(1024 * 1024)]) {
        for (const chunked of [false, true]) {
          const input = chunked ? { chunks: [Buffer.from(payload)] } : { body: payload };
          await compare({ path: `${base}?case=body-state`, method: "POST", ...input,
            json: { before: false, after: true, rejected: true, clone: payload } });
          await compare({ path: `${base}?case=body-text`, method: "POST", ...input,
            json: { text: payload, used: true } });
          await compare({ path: `${base}?case=body-bytes`, method: "POST", ...input, text: payload });
        }
      }
      // A one-byte body keeps the reader result independent of HTTP chunking.
      await compare({ path: `${base}?case=body-lock`, method: "POST", body: "x",
        json: { before: false, after: true, readRejected: true, cloneRejected: true, length: 1 } });
      await compare({ path: base, method: "POST", body: "broken json", status: 500, text: "" });
      await compare({ path: base, method: "DELETE", status: 405, text: "", allow });
      await compare({ path: base, method: "OPTIONS", status: 204, text: "", allow });
      await compare({ path: `${base}?case=text`, method: "HEAD", status: 200, text: "" });
      await compare({ path: `${base}?case=missing`, method: "HEAD", status: 404, text: "" });
      const failure = await compare({ path: `${base}?case=throw`, status: 500, text: "" });
      assert.equal(failure.headers.vary, appVary);
      await compare({ path: base, method: "PUT", status: 500, text: "" });
      await compare({ path: base, method: "PATCH", status: 500, text: "" });
      await compare({ path: "/elsewhere", status: 404, text: "" });
      await compare({ path: "/api/%E0%A4%A", status: 400, text: "" });
      const dynamic = await compare({ path: "/api/hello%20world/a%2Fb/%E4%B8%96%E7%95%8C/" });
      assert.deepEqual(JSON.parse(dynamic.body).params, { id: "hello world", slug: ["a/b", "世界"] });
      assert.match(node.stderr, /shim fixture failure/);
      assert.match(native.stderr, /shim fixture failure/);
      assert.match(node.stderr, /shim synchronous failure/);
      assert.match(native.stderr, /shim synchronous failure/);
      assert.match(node.stderr, /shim rejected failure/);
      assert.match(native.stderr, /shim rejected failure/);
    });
    await pair(binary, { SHIM_INTERCEPTION: "1" }, async (compare) => {
      for (const pathname of ["/api/intercepted", "/api/ordinary"]) {
        const expected = nextVary(pathname, ["^/api/intercepted(?:/|$)"]);
        const result = await compare({ path: `${pathname}?case=next-url`, headers: { "next-url": "/source" }, json: { nextUrl: expected.nextUrl } });
        assert.equal(result.headers.vary, expected.vary);
      }
    });
    for (const marker of ["(.)", "(..)", "(...)", "(..)(..)"]) {
      const pathname = `/api/${marker}intercepted`;
      await pair(binary, { SHIM_PATTERN: pathname }, async (compare) => {
        const expected = nextVary(pathname);
        const result = await compare({ path: `${pathname}?case=next-url`, headers: { "next-url": "/source" }, json: { nextUrl: expected.nextUrl } });
        assert.equal(result.headers.vary, expected.vary);
      });
    }
    await pair(binary, { SHIM_PATTERN: "/api/[id]/[...slug]" }, async (compare) => {
      await compare({ path: "/api/a", status: 404 });
      const result = await compare({ path: "/api/a/b/c" });
      assert.deepEqual(JSON.parse(result.body).params, { id: "a", slug: ["b", "c"] });
    }, "SIGINT");
    await pair(binary, { SHIM_PATTERN: "/api/[id]" }, async (compare) => {
      const result = await compare({ path: "/api/a%2Bb" });
      assert.deepEqual(JSON.parse(result.body).params, { id: "a+b" });
      await compare({ path: "/api/a/b", status: 404 });
    });
    await pair(binary, { SHIM_PATTERN: "/api/static" }, async (compare) => {
      const result = await compare({ path: "/api/static/" });
      assert.deepEqual(JSON.parse(result.body).params, {});
      await compare({ path: "/api/other", status: 404 });
    });
    await pair(binary, { SHIM_PATTERN: "/" }, async (compare) => {
      const result = await compare({ path: "/" });
      assert.deepEqual(JSON.parse(result.body).params, {});
      await compare({ path: "/api/a", status: 404 });
    });
    await pair(binary, { SHIM_METHODS: "empty" }, async (compare) => {
      await compare({ path: "/api/static", status: 405, allow: "OPTIONS", text: "" });
      await compare({ path: "/api/static", method: "HEAD", status: 405, allow: "OPTIONS", text: "" });
      await compare({ path: "/api/static", method: "OPTIONS", status: 204, allow: "OPTIONS", text: "" });
    });
    await pair(binary, { SHIM_METHODS: "explicit", PORT: "invalid" }, async (compare) => {
      await compare({ path: "/api/static", method: "HEAD", status: 202, text: "" });
      await compare({ path: "/api/static", method: "OPTIONS", status: 200, text: "explicit options" });
      await compare({ path: "/api/static", method: "POST", status: 405, allow: "GET, HEAD, OPTIONS" });
    });
    for (const signal of ["SIGTERM", "SIGINT"]) {
      await pair(binary, {}, async (compare, { node, native }) => {
        const pending = compare({ path: "/api/a?case=slow", status: 200, text: "first:世界:last" });
        // Attach a rejection handler while waiting for evidence both handlers began.
        pending.catch(() => {});
        await Promise.all([node, native].map((state) => waitForOutput(state, /shim fixture: slow request started/)));
        node.child.kill(signal);
        native.child.kill(signal);
        await pending;
      }, signal);
    }
    for (const command of [process.execPath, binary]) {
      const args = command === binary ? [] : ["--import", path.join(directory, "node-next-server.mjs"), entry];
      const owner = start(process.execPath, ["-e", `
        const child = require("node:child_process").spawn(${JSON.stringify(command)}, ${JSON.stringify(args)}, {
          env: { ...process.env, PORT: "0", NEXT_SCRIPTC_PARENT: String(process.pid) },
          stdio: ["ignore", "inherit", "inherit"],
        });
        console.log("shim owner: child PID " + child.pid);
      `]);
      let response;
      let pid;
      try {
        const match = await waitForOutput(owner, /next-scriptc: listening on 127\.0\.0\.1:(\d+)/);
        pid = Number(owner.stdout.match(/shim owner: child PID (\d+)/)[1]);
        response = await new Promise((resolve, reject) => {
          http.get({ host: "127.0.0.1", port: Number(match[1]), path: "/api/a?case=cancel", agent: false }, (res) => {
            res.on("error", () => {});
            res.once("data", () => resolve(res));
          }).on("error", reject);
        });
        // Parent death must terminate an asynchronous never-ending response.
        const started = performance.now();
        owner.child.kill("SIGKILL");
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Worker survived parent death for 2.5 seconds")), 2500);
          owner.child.stdout.once("close", () => { clearTimeout(timer); resolve(); });
        });
        assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
        console.log(`Parent death during active stream (${command === binary ? "native" : "Node"}): ${(performance.now() - started).toFixed(1)}ms`);
      } finally {
        response?.destroy();
        if (pid) { try { process.kill(pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; } }
        await stop(owner);
      }
    }
    for (const port of [undefined, "", "invalid", "-1", "65536", "1.5"]) {
      for (const command of [process.execPath, binary]) {
        const invalid = start(command, command === binary ? [] : ["--import", path.join(directory, "node-next-server.mjs"), entry], { PORT: port });
        const result = await invalid.exit;
        assert.notEqual(result.code, 0);
        assert.match(invalid.stderr, /PORT must be an integer between 0 and 65535/);
        processes.delete(invalid);
      }
    }
    console.log(`Compared ${comparisons} requests: identical status, statusText, headers (except date/runtime marker), and body.`);
  } finally {
    await new Promise((resolve) => upstream.close(resolve));
    await Promise.allSettled([...processes].map((state) => stop(state)));
    await rm(temporary, { recursive: true, force: true });
  }
});
