import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";

const root = path.resolve(import.meta.dirname, "../../..");
const demo = path.join(root, "examples/demo");
const curl = promisify(execFile);
const port = 3417;
const routes = ["/api/hello", "/api/primes?limit=1000", "/api/url-echo?q=a%20b&plus=a+b", "/api/items/hello%20world", "/api/items/new"];
const running = new Set();

function start(args) {
  const child = spawn("pnpm", ["--filter", "demo", ...args], { cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"] });
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

function wait(state, expression) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`Timeout: ${expression}\n${state.output}`)), 60_000);
    function finish(error) {
      clearTimeout(timer);
      state.listeners.delete(check);
      if (error) reject(error); else resolve();
    }
    function check() {
      if (expression.test(state.output)) finish();
      else if (state.done) finish(new Error(`Exited before ${expression}\n${state.output}`));
    }
    state.listeners.add(check);
    check();
  });
}

async function stop(state) {
  if (!state.done) process.kill(-state.child.pid, "SIGTERM");
  const timer = setTimeout(() => {
    try { process.kill(-state.child.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  }, 10_000);
  try { await state.exit; } finally { clearTimeout(timer); running.delete(state); }
}

async function responses(native) {
  const results = [];
  for (const route of routes) {
    const { stdout } = await curl("curl", ["--silent", "--show-error", "--fail", "--max-time", "30", "-i", `http://localhost:${port}${route}`], { encoding: "buffer" });
    const split = stdout.indexOf("\r\n\r\n");
    const headers = stdout.subarray(0, split).toString();
    const body = stdout.subarray(split + 4);
    assert.equal(/x-next-scriptc: native/i.test(headers), native && route !== "/api/items/new", headers);
    results.push(body);
  }
  assert.deepEqual(JSON.parse(results[2]), { url: `http://localhost:${port}/api/url-echo?q=a+b&plus=a+b`, host: `localhost:${port}` });
  assert.deepEqual(JSON.parse(results[3]), { id: "hello world" });
  assert.deepEqual(JSON.parse(results[4]), { node: "new item" });
  return results;
}

async function reportResponses(native) {
  const results = [];
  for (const threads of [1, 4, 1]) {
    const response = await fetch(`http://localhost:${port}/api/report?threads=${threads}`, { signal: AbortSignal.timeout(120_000) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-next-scriptc"), native ? "native" : null);
    const body = await response.json();
    assert.equal(body.sharedByReference, native);
    assert.equal(body.threads, threads);
    assert.equal(body.poolSize, 8);
    assert.equal(body.workers, results.length === 0 ? 1 : 4, "persistent pool reused");
    assert.ok(body.elapsedMs > 0);
    assert.ok(body.rss > 0 && body.datasetRss > 0 && body.baselineRss > 0);
    assert.equal(body.workerRssGrowth, (body.rss - body.datasetRss) / body.workers);
    assert.equal(body.nodeVersion, native ? null : process.version);
    // Timing, memory, pool state, and the intentional runtime capability differ.
    results.push(Buffer.from(JSON.stringify(body.result)));
  }
  assert.deepEqual(results[0], results[1], "report result is independent of partition count");
  assert.deepEqual(results[0], results[2], "persistent pool returns the same report");
  for (const threads of ["0", "9", "1.5", "nope"]) {
    const response = await fetch(`http://localhost:${port}/api/report?threads=${threads}`);
    assert.equal(response.status, 400);
  }
  return results;
}

async function assertPortsFree(ports) {
  for (const port of ports) {
    const server = createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    await new Promise((resolve) => server.close(resolve));
  }
}

try {
  const build = start(["build"]);
  assert.equal((await build.exit).code, 0, build.output);
  running.delete(build);
  const manifest = JSON.parse(await readFile(path.join(demo, ".next/scriptc/manifest.json"), "utf8"));
  const ports = [port, ...manifest.routes.map((route) => route.port)];
  const dev = start(["dev", "-p", String(port)]);
  await wait(dev, /Ready in/);
  const reference = await responses(false);
  const reportReference = await reportResponses(false);
  await stop(dev);
  await assertPortsFree(ports);

  const production = start(["start", "-p", String(port)]);
  await wait(production, /Ready in/);
  assert.deepEqual(await responses(true), reference, "dev/native body bytes");
  assert.deepEqual(await reportResponses(true), reportReference, "dev/native report result bytes (threads 1, 4, 1)");
  const pids = [...production.output.matchAll(/native PID (\d+)/g)].map((match) => Number(match[1]));
  assert.equal(pids.length, manifest.routes.length);
  // Signal just the wrapper: it must terminate both detached Next and native groups.
  const { stdout: processList } = await curl("ps", ["-axo", "pid=,ppid=,args="]);
  const processes = processList.split("\n").map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)).filter(Boolean);
  const descendants = new Set([production.child.pid]);
  let wrapper;
  for (let i = 0; i < processes.length; i++) {
    for (const [, pid, parent, command] of processes) {
      if (!descendants.has(Number(parent))) continue;
      descendants.add(Number(pid));
      if (/node .*next-scriptc.*cli.mjs start/.test(command)) wrapper = Number(pid);
    }
    if (wrapper) break;
  }
  assert.ok(wrapper, "Missing CLI wrapper descendant");
  const owned = processes.filter(([, , parent]) => Number(parent) === wrapper).map(([, pid]) => Number(pid));
  process.kill(wrapper, "SIGTERM");
  assert.notEqual((await production.exit).code, 0, production.output);
  running.delete(production);
  for (const pid of new Set([...pids, ...owned])) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  await assertPortsFree(ports);

  const occupied = createServer();
  await new Promise((resolve) => occupied.listen(manifest.routes[0].port, "127.0.0.1", resolve));
  try {
    const conflict = start(["start", "-p", String(port)]);
    assert.notEqual((await conflict.exit).code, 0);
    assert.match(conflict.output, /EADDRINUSE/);
    assert.match(conflict.output, /native port/);
    running.delete(conflict);
  } finally { await new Promise((resolve) => occupied.close(resolve)); }
  await assertPortsFree(ports);
  const crashed = start(["start", "-p", String(port)]);
  await wait(crashed, /Ready in/);
  const crashPid = Number(crashed.output.match(/native PID (\d+)/)[1]);
  process.kill(crashPid, "SIGKILL");
  assert.notEqual((await crashed.exit).code, 0);
  assert.match(crashed.output, /SIGKILL/);
  running.delete(crashed);
  await assertPortsFree(ports);

  const nextPort = createServer();
  await new Promise((resolve) => nextPort.listen(port, resolve));
  try {
    const conflict = start(["start", "-p", String(port)]);
    assert.notEqual((await conflict.exit).code, 0);
    assert.match(conflict.output, /EADDRINUSE/);
    running.delete(conflict);
  } finally { await new Promise((resolve) => nextPort.close(resolve)); }
  await assertPortsFree(ports);
  const unwrapped = start(["exec", "next", "start", "-p", String(port)]);
  assert.notEqual((await unwrapped.exit).code, 0);
  assert.match(unwrapped.output, /Start native routes with `next-scriptc start`/);
  running.delete(unwrapped);
  await assertPortsFree(ports);
  console.log(`E2E passed: ${routes.length} curl responses and report results (threads 1, 4, 1) byte-equal; native/static precedence, wrapper SIGTERM cleanup, native crash, native/Next EADDRINUSE, and direct-next-start guard.`);
} finally {
  await Promise.allSettled([...running].map(stop));
}
