import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { test } from "node:test";

const directory = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(directory, "entry.ts");
const compiler = path.resolve(directory, "../../node_modules/.bin/scriptc");
const processes = new Set();
let comparisons = 0;

function start(command, args, env = {}) {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
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

async function pair(binary, env, run, signal = "SIGTERM") {
  const node = start(process.execPath, [entry], { PORT: "0", ...env });
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
      assert.deepEqual(result, expected, `${specification.method || "GET"} ${specification.path}`);
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
    response.writeHead(200, { "content-encoding": "gzip", "content-length": body.length });
    response.end(body);
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  try {
    const build = start(compiler, ["build", entry, "-o", binary, "--no-keep-llvm"]);
    const result = await build.exit;
    processes.delete(build);
    assert.equal(result.code, 0, `${build.stdout}\n${build.stderr}`);
    await pair(binary, { SHIM_UPSTREAM: `http://127.0.0.1:${upstream.address().port}` }, async (compare, { node, native }) => {
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
      const framing = await compare({ path: `${base}?case=framing`, text: "decoded" });
      assert.equal(framing.headers["x-hop"], undefined);
      assert.equal(framing.headers["keep-alive"], undefined);
      assert.equal(framing.headers["content-length"], "7");
      const fetched = await compare({ path: `${base}?case=fetch`, text: "decoded upstream 世界" });
      assert.equal(fetched.headers["content-encoding"], undefined);
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
      await compare({ path: base, method: "POST", body: "broken json", status: 500, text: "" });
      await compare({ path: base, method: "DELETE", status: 405, text: "", allow });
      await compare({ path: base, method: "OPTIONS", status: 204, text: "", allow });
      await compare({ path: `${base}?case=text`, method: "HEAD", status: 200, text: "" });
      await compare({ path: `${base}?case=missing`, method: "HEAD", status: 404, text: "" });
      await compare({ path: `${base}?case=throw`, status: 500, text: "" });
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
    for (const port of [undefined, "", "invalid", "-1", "65536", "1.5"]) {
      for (const command of [process.execPath, binary]) {
        const invalid = start(command, command === binary ? [] : [entry], { PORT: port });
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
