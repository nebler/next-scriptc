import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const directory = import.meta.dirname;
const entry = path.join(directory, "vercel-entry.ts");
const compiler = path.resolve(directory, "../../node_modules/.bin/scriptc");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label) {
  const deadline = Date.now() + 10_000;
  while (!check()) {
    assert.ok(Date.now() < deadline, `Timed out: ${label}`);
    await delay(10);
  }
}
function start(command, args, env) {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  const state = { child, stdout: "", stderr: "", exited: false };
  child.stdout.on("data", (chunk) => { state.stdout += chunk; });
  child.stderr.on("data", (chunk) => { state.stderr += chunk; });
  state.exit = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => { state.exited = true; resolve({ code, signal }); });
  });
  return state;
}
async function stop(state) {
  if (!state.exited) state.child.kill("SIGTERM");
  await until(() => state.exited, "child shutdown").catch((error) => { state.child.kill("SIGKILL"); throw error; });
  await state.exit;
}
function request(port, pathname, headers = {}, method = "GET", body, agent = false) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: pathname, method, agent, headers }, (res) => {
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.once("error", reject);
      res.once("end", () => resolve({ status: res.statusCode, body: text, headers: res.headers }));
    });
    req.setTimeout(5000, () => req.destroy(new Error("request timeout")));
    req.once("error", reject);
    req.end(body);
  });
}

// Scenarios mirror the pinned proxy's ipc_wire, http_routing and
// http_resilience tests. Exercise real compiled code, not a JS IPC mock.
test("Vercel executable IPC: startup, concurrency, streams, errors, aborts and ping", { timeout: 180_000 }, async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "sc-ipc-"));
  const binary = path.join(temporary, "entry");
  try {
    const build = start(compiler, ["build", entry, "-o", binary, "--no-keep-llvm"]);
    assert.equal((await build.exit).code, 0, build.stderr);
    for (const grouped of [false, true]) {
      const frames = [];
      const sockets = new Set();
      const socketPath = path.join(temporary, "ipc.sock");
      let buffered = "";
      const ipc = net.createServer((socket) => {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
        socket.on("data", (chunk) => {
          buffered += chunk.toString();
          let end;
          while ((end = buffered.indexOf("\0")) !== -1) {
            frames.push({ raw: buffered.slice(0, end), value: JSON.parse(buffered.slice(0, end)) });
            buffered = buffered.slice(end + 1);
          }
        });
      });
      await new Promise((resolve, reject) => { ipc.once("error", reject); ipc.listen(socketPath, resolve); });
      const state = start(binary, [], { VERCEL_IPC_PATH: socketPath, GROUPED: grouped ? "1" : "" });
      try {
        await until(() => frames.length || state.exited, "server-started");
        assert.ok(!state.exited, state.stderr);
        const startup = frames[0].value;
        assert.equal(startup.type, "server-started");
        assert.ok(Number.isInteger(startup.payload.initDuration) && startup.payload.initDuration >= 0);
        const port = startup.payload.httpPort;
        // Deliberately connect immediately at IPC readiness, without retries.
        assert.deepEqual((await request(port, "/%5fvercel/ping?probe=1", {
          "x-vercel-internal-invocation-id": "ping", "x-vercel-internal-request-id": "1",
        })).body, "OK");
        const invocation = 'quote"slash\\-escaped';
        const headers = (id, name = invocation) => ({
          "x-vercel-internal-invocation-id": name, "x-vercel-internal-request-id": String(id),
        });
        const ends = () => frames.filter((frame) => frame.value.type === "end");
        async function completion(count) {
          await until(() => ends().length >= count || state.exited, `${count} end frames`);
          assert.ok(!state.exited, state.stderr);
          assert.equal(ends().length, count);
        }
        const echo = await request(port, "/rewrite?q=a%20b&nxtPid=hello", {
          ...headers("18446744073709551615"), "x-matched-path": "/api/[id]",
          "x-forwarded-host": "public.example", "x-forwarded-proto": "https",
          "X-Vercel-Internal-Secret": "private", "x-public": "kept",
          "x-forwarded-for": "192.0.2.1",
        });
        assert.equal(echo.status, 200);
        const observation = JSON.parse(echo.body);
        assert.equal(observation.url, "https://public.example/rewrite?q=a+b");
        const seen = Object.fromEntries(observation.headers);
        assert.equal(seen.host, "public.example");
        assert.equal(seen["x-matched-path"], "/api/[id]");
        assert.equal(seen["x-public"], "kept");
        assert.equal(seen["x-forwarded-for"], "192.0.2.1");
        assert.ok(!Object.keys(seen).some((name) => name.startsWith("x-vercel-internal-")));
        await completion(1);
        assert.match(ends()[0].raw, /"requestId":18446744073709551615/);
        assert.equal(ends()[0].value.payload.context.invocationId, invocation);
        await Promise.all(Array.from({ length: 32 }, async (_, i) => {
          assert.equal((await request(port, "/api/a", headers(i + 1))).status, 200);
        }));
        await completion(33);
        assert.deepEqual(ends().slice(1).map((frame) => frame.value.payload.context.requestId).sort((a, b) => a - b), Array.from({ length: 32 }, (_, i) => i + 1));
        await new Promise((resolve, reject) => {
          const req = http.get({ host: "127.0.0.1", port, path: "/api/a?mode=stream", headers: headers(34), agent: false }, (res) => {
            let body = "";
            res.on("data", (chunk) => {
              body += chunk;
              if (body === "first") assert.equal(ends().length, 33, "end must follow stream completion");
            });
            res.once("error", reject);
            res.once("end", () => { assert.equal(body, "firstlast"); resolve(); });
          });
          req.once("error", reject);
        });
        await completion(34);
        assert.equal((await request(port, "/api/a?mode=throw", headers(35))).status, 500);
        await completion(35);
        await assert.rejects(request(port, "/api/a?mode=stream-error", headers(36)));
        await completion(36);
        await new Promise((resolve, reject) => {
          const req = http.get({ host: "127.0.0.1", port, path: "/api/a?mode=cancel", headers: headers(37), agent: false }, (res) => {
            res.once("data", () => { res.destroy(); resolve(); });
            res.on("error", () => {});
          });
          req.once("error", reject);
        });
        await completion(37);
        await until(() => state.stdout.includes("fixture: cancelled"), "stream cancellation");
        await new Promise((resolve) => {
          const req = http.request({ host: "127.0.0.1", port, path: "/api/a", method: "POST", agent: false,
            headers: { ...headers(38), "content-length": "1048576" } });
          req.on("error", () => {});
          req.once("close", resolve);
          req.flushHeaders();
          req.write("partial");
          setTimeout(() => req.destroy(), 50);
        });
        await completion(38);
        assert.equal((await request(port, "/missing", headers(39))).status, 404);
        assert.equal((await request(port, "/api/a", headers("invalid"))).status, 200);
        await completion(40);
        assert.equal(ends().at(-1).value.payload.context.requestId, 0);
        assert.equal((await request(port, "/api/a")).status, 200);
        const agent = new http.Agent({ keepAlive: true });
        try {
          for (const id of [41, 42]) {
            assert.equal((await request(port, "/api/a", headers(id), "GET", undefined, agent)).status, 200);
            await completion(id);
          }
        } finally { agent.destroy(); }
        await delay(100);
        assert.equal(ends().length, 42, "no duplicate ends or end for ping/unidentified request");
        assert.equal(frames.filter((frame) => frame.value.type === "server-started").length, 1);
        assert.equal(buffered, "");
        // The persistent IPC stream is required for the lifetime of the instance.
        for (const socket of sockets) socket.destroy();
        assert.equal((await state.exit).code, 1);
      } finally {
        await stop(state);
        for (const socket of sockets) socket.destroy();
        await new Promise((resolve) => ipc.close(resolve));
      }
    }
    const missing = start(binary, [], { VERCEL_IPC_PATH: path.join(temporary, "missing.sock") });
    try {
      await until(() => missing.exited, "IPC connection failure");
      assert.equal((await missing.exit).code, 1);
    } finally { await stop(missing); }
    // Even an inherited socket path must not activate IPC in self-hosted mode.
    const self = start(binary, [], { SELF_HOSTED: "1", VERCEL_IPC_PATH: path.join(temporary, "missing.sock") });
    try {
      await until(() => /listening on 127\.0\.0\.1:(\d+)/.test(self.stdout) || self.exited, "self-hosted readiness");
      assert.ok(!self.exited, self.stderr);
      const port = Number(self.stdout.match(/listening on 127\.0\.0\.1:(\d+)/)[1]);
      assert.equal((await request(port, "/api/a")).status, 200);
    } finally { await stop(self); }
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
