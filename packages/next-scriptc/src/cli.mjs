#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import path from "node:path";
import { parseArgs } from "node:util";
import { readManifest } from "./manifest.mjs";

if (process.platform === "win32") throw new Error("[next-scriptc] Windows is unsupported; use macOS or Linux.");

const [command, ...args] = process.argv.slice(2);
if (command !== "start" || args.includes("--help") || args.includes("-h")) {
  console.log("Usage: next-scriptc start [directory] [-p port] [-H hostname] [--keepAliveTimeout ms]");
  process.exit(command === "start" ? 0 : 1);
}

const children = [];
const controller = new AbortController();
let stopping = false;
let signalCode = 0;

function onSignal(signal) {
  signalCode = signal === "SIGINT" ? 130 : 143;
  controller.abort();
}

function kill(child, signal) {
  if (!child.pid) return;
  try {
    // Separate process groups let cleanup include any descendants Next starts.
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

function spawnChild(executable, arguments_, options, label) {
  controller.signal.throwIfAborted();
  const child = spawn(executable, arguments_, {
    stdio: "inherit",
    detached: true,
    ...options,
  });
  const exited = new Promise((resolve) => {
    const finish = (error) => {
      resolve();
      if (!stopping) controller.abort(error);
    };
    child.once("error", (cause) => finish(new Error(`[next-scriptc] Cannot start ${label}`, { cause })));
    child.once("exit", (code, signal) => finish(new Error(`[next-scriptc] ${label} exited (${signal ?? `exit ${code}`}).`)));
  });
  children.push({ child, exited });
  return child;
}

function waitForReady(child, route) {
  return new Promise((resolve, reject) => {
    const lines = createInterface({ input: child.stdout });
    const timeout = setTimeout(() => finish(new Error(`[next-scriptc] ${route.pattern} on port ${route.port} did not become ready within 30 seconds.`)), 30_000);
    function aborted() { finish(controller.signal.reason); }
    function finish(error) {
      clearTimeout(timeout);
      lines.close();
      controller.signal.removeEventListener("abort", aborted);
      if (error) reject(error);
      else resolve();
    }
    lines.on("line", (line) => {
      if (line === `next-scriptc: listening on 127.0.0.1:${route.port}`) finish();
    });
    controller.signal.addEventListener("abort", aborted, { once: true });
    if (controller.signal.aborted) aborted();
    child.stdout.pipe(process.stdout);
  });
}

async function stopChildren() {
  stopping = true;
  for (const { child } of children) kill(child, "SIGTERM");
  const timeout = setTimeout(() => {
    for (const { child } of children) kill(child, "SIGKILL");
  }, 5000);
  try {
    await Promise.all(children.map(({ exited }) => exited));
  } finally {
    clearTimeout(timeout);
  }
}

// Also handle an unexpected synchronous exit after startup.
process.on("exit", () => {
  for (const { child } of children) kill(child, "SIGKILL");
});
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);

try {
  const { positionals } = parseArgs({ args, allowPositionals: true, options: {
    port: { type: "string", short: "p" },
    hostname: { type: "string", short: "H" },
    keepAliveTimeout: { type: "string" },
  } });
  if (positionals.length > 1) throw new Error("[next-scriptc] Expected at most one project directory.");
  const projectDir = path.resolve(positionals[0] ?? ".");
  const require = createRequire(path.join(projectDir, "package.json"));
  process.env.NEXT_SCRIPTC_PROJECT = projectDir;
  const loadConfig = require("next/dist/server/config.js").default;
  const config = await loadConfig("phase-production-server", projectDir);
  const distDir = path.resolve(projectDir, config.distDir);
  const manifest = await readManifest(distDir);

  await Promise.all(manifest.routes.map(async (route) => {
    const binary = path.join(distDir, "scriptc", route.binary);
    const child = spawnChild(binary, [], {
      cwd: projectDir,
      env: { ...process.env, PORT: String(route.port) },
      stdio: ["inherit", "pipe", "inherit"],
    }, `${route.pattern} (native port ${route.port}; check stderr for EADDRINUSE if occupied)`);
    await waitForReady(child, route);
    controller.signal.throwIfAborted();
    console.log(`[next-scriptc] ${route.pattern} → native PID ${child.pid}, port ${route.port}`);
  }));

  spawnChild(process.execPath, [require.resolve("next/dist/bin/next"), "start", ...args], {
    cwd: process.cwd(),
    env: process.env,
  }, "next start");
  await new Promise((resolve) => {
    if (controller.signal.aborted) resolve();
    else controller.signal.addEventListener("abort", resolve, { once: true });
  });
  if (!signalCode) throw controller.signal.reason;
} catch (error) {
  if (!signalCode) {
    console.error(error);
    process.exitCode = 1;
  }
} finally {
  await stopChildren();
  if (signalCode) process.exitCode = signalCode;
}
