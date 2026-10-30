import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";

const root = path.resolve(import.meta.dirname, "../../..");
const demo = path.join(root, "examples/demo");
const curl = promisify(execFile);
const port = Number(process.env.E2E_PORT ?? "3417");
const routes = ["/api/hello", "/api/primes?limit=1000", "/api/url-echo?q=a%20b&plus=a+b", "/api/items/hello%20world", "/api/items/new", "/api/feed.xml"];
const running = new Set();
let nativePatterns;

function start(args) {
  const production = args[0] === "start" || args[0] === "alias";
  const command = production ? process.execPath : "pnpm";
  const arguments_ = production
    ? [args[0] === "alias" ? path.join(root, "packages/next-scriptc/src/cli.mjs") : path.join(demo, "node_modules/next/dist/bin/next"), "start", ...args.slice(1)]
    : ["--filter", "demo", ...args];
  const child = spawn(command, arguments_, { cwd: production ? demo : root, detached: true, stdio: ["ignore", "pipe", "pipe"] });
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

function wait(state, expression, offset = 0) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`Timeout: ${expression}\n${state.output}`)), 60_000);
    function finish(error) {
      clearTimeout(timer);
      state.listeners.delete(check);
      if (error) reject(error); else resolve();
    }
    function check() {
      if (expression.test(state.output.slice(offset))) finish();
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
    assert.equal(/x-next-scriptc: native/i.test(headers), native && (nativePatterns.has(route.split("?")[0]) || (route.startsWith("/api/items/") && route !== "/api/items/new")), headers);
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

function nativePids(state) {
  return [...state.output.matchAll(/native PID (\d+)/g)].map((match) => Number(match[1]));
}

async function productionReady(state) {
  // Next logs "Ready" before loading config. A completed HTTP response also
  // proves the adapter's async readiness barrier has finished.
  await wait(state, /Ready in/);
  const response = await fetch(`http://127.0.0.1:${port}/api/url-echo?ready=1`, { signal: AbortSignal.timeout(30_000) });
  await response.arrayBuffer();
  assert.equal(response.status, 200, state.output);
  assert.equal(response.headers.get("x-next-scriptc"), "native", state.output);
}

async function assertGone(pids) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const alive = pids.filter((pid) => {
      try { process.kill(pid, 0); return true; } catch (error) { if (error.code !== "ESRCH") throw error; return false; }
    });
    if (!alive.length) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Native processes survived server exit: ${pids}`);
}

try {
  if (!process.argv.includes("--skip-build")) {
    const build = start(["build"]);
    assert.equal((await build.exit).code, 0, build.output);
    running.delete(build);
  }
  const manifest = JSON.parse(await readFile(path.join(demo, ".next/scriptc/manifest.json"), "utf8"));
  nativePatterns = new Set(manifest.routes.map((route) => route.pattern));
  assert.ok(nativePatterns.has("/api/url-echo"), "native static-pattern route remains covered");
  assert.ok(!nativePatterns.has("/api/feed.xml"), "prerendered handler needs no binary");
  const routing = JSON.parse(await readFile(path.join(demo, ".next/routes-manifest.json"), "utf8"));
  assert.ok(!routing.rewrites.beforeFiles.some((route) => route.source.includes("feed")), "prerender rewrite removed");
  const ports = [port, ...manifest.routes.map((route) => route.port)];
  await assertPortsFree(ports);
  const dev = start(["dev", "-p", String(port)]);
  await wait(dev, /Ready in/);
  const reference = await responses(false);
  const reportReference = await reportResponses(false);
  await stop(dev);
  await assertPortsFree(ports);

  const production = start(["start", "-p", String(port)]);
  await productionReady(production);
  assert.deepEqual(await responses(true), reference, "dev/native body bytes");
  assert.deepEqual(await reportResponses(true), reportReference, "dev/native report result bytes (threads 1, 4, 1)");
  const pids = [...production.output.matchAll(/native PID (\d+)/g)].map((match) => Number(match[1]));
  assert.equal(pids.length, manifest.routes.length);
  // Signal only the Next server, leaving native children to its lifecycle hook.
  const { stdout: processList } = await curl("ps", ["-axo", "pid=,ppid=,args="]);
  const processes = processList.split("\n").map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)).filter(Boolean);
  const owned = processes.filter(([, , parent]) => Number(parent) === production.child.pid).map(([, pid]) => Number(pid));
  assert.deepEqual(owned.sort((a, b) => a - b), [...pids].sort((a, b) => a - b), "only native binaries are children of Next; no supervisor or server child");
  production.child.kill("SIGTERM");
  assert.equal((await production.exit).code, 143, production.output);
  running.delete(production);
  await assertGone(pids);
  await assertPortsFree(ports);

  const killed = start(["start", "-p", String(port)]);
  await productionReady(killed);
  const killedPids = nativePids(killed);
  assert.equal(killedPids.length, manifest.routes.length, "each binary starts exactly once");
  killed.child.kill("SIGKILL");
  assert.equal((await killed.exit).signal, "SIGKILL");
  running.delete(killed);
  await assertGone(killedPids);
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
  await productionReady(crashed);
  const crashRoute = manifest.routes.find((route) => route.pattern === "/api/url-echo");
  const crashPid = Number(crashed.output.match(new RegExp(`native PID (\\d+), port ${crashRoute.port}\\b`))[1]);
  process.kill(crashPid, "SIGKILL");
  await assertGone([crashPid]);
  const unavailable = await fetch(`http://localhost:${port}/api/url-echo`);
  assert.equal(unavailable.status, 500, "Next's refused-destination proxy response");
  await unavailable.arrayBuffer();
  for (const pathname of ["/", "/api/primes?limit=10", "/api/feed.xml"]) {
    const response = await fetch(`http://localhost:${port}${pathname}`);
    assert.equal(response.status, 200, pathname);
    await response.arrayBuffer();
  }
  await wait(crashed, new RegExp(`native PID (?!${crashPid},)\\d+, port ${crashRoute.port}\\b`));
  const recovered = await fetch(`http://localhost:${port}/api/url-echo`);
  assert.equal(recovered.status, 200);
  assert.equal(recovered.headers.get("x-next-scriptc"), "native");
  await recovered.arrayBuffer();
  assert.equal(nativePids(crashed).length, manifest.routes.length + 1, "only the crashed route restarted");
  // Repeated failures stop retrying this route without taking down Next.
  for (let count = 2; count <= 5; count++) {
    const offset = crashed.output.length;
    const matches = [...crashed.output.matchAll(new RegExp(`native PID (\\d+), port ${crashRoute.port}\\b`, "g"))];
    process.kill(Number(matches.at(-1)[1]), "SIGKILL");
    await wait(crashed, count === 5 ? /giving up after 5 crashes within 30 seconds/ : new RegExp(`native PID \\d+, port ${crashRoute.port}\\b`), offset);
  }
  const stillHealthy = await fetch(`http://localhost:${port}/api/primes?limit=10`);
  assert.equal(stillHealthy.status, 200);
  await stillHealthy.arrayBuffer();
  await stop(crashed);
  await assertGone(nativePids(crashed));
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
  const alias = start(["alias", "-p", String(port)]);
  await productionReady(alias);
  assert.equal(nativePids(alias).length, manifest.routes.length);
  alias.child.kill("SIGTERM");
  assert.equal((await alias.exit).code, 143, alias.output);
  running.delete(alias);
  await assertGone(nativePids(alias));
  await assertPortsFree(ports);
  console.log(`E2E passed: ${routes.length} curl responses and report results (threads 1, 4, 1) byte-equal; native/static precedence, plain-next-start ownership, server-only SIGTERM/SIGKILL cleanup within 2.5s, isolated native crash/recovery (Next proxy HTTP 500), native/Next EADDRINUSE, and same-process CLI alias.`);
} finally {
  await Promise.allSettled([...running].map(stop));
}
