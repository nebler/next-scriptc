import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { readManifest } from "./manifest.mjs";

// Next caches production config in this process. Also share an in-flight start
// if another caller loads the same build through a different config cache key.
const starts = new Map();
const children = new Set();
let stopping = false;
let hooksInstalled = false;

function installExitHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  // Next owns graceful signal handling; keep workers until it finishes draining.
  for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
    process.once(signal, () => {
      stopping = true;
      // Bound draining even if a native handler never finishes its response.
      setTimeout(() => process.exit(code), 5000).unref();
    });
  }
  process.once("exit", () => {
    for (const child of children) child.kill("SIGKILL");
  });
}

function waitForReadiness(worker, group) {
  const { child, route, label } = worker;
  return new Promise((resolve, reject) => {
    const lines = createInterface({ input: child.stdout });
    const timeout = setTimeout(() => {
      finish(new Error(`[next-scriptc] ${label} did not become ready within 30 seconds.`));
      child.kill("SIGKILL");
    }, 30_000);
    let settled = false;
    function finish(error) {
      // A worker may die after its readiness line while siblings still start.
      if (error && !group.ready) group.failure = error;
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      lines.close();
      if (error) reject(error);
      else resolve();
    }
    child.once("error", (cause) => finish(new Error(`[next-scriptc] Cannot start ${label}`, { cause })));
    child.once("exit", (code, signal) => {
      const error = new Error(`[next-scriptc] ${label} exited (${signal ?? `exit ${code}`}).`);
      if (group.ready && settled && !stopping) console.error(error.message);
      finish(error);
    });
    lines.on("line", (line) => {
      if (line === `next-scriptc: listening on 127.0.0.1:${route.port}`) {
        console.log(`[next-scriptc] ${route.pattern} → native PID ${child.pid}, port ${route.port}`);
        finish();
      }
    });
  });
}

function superviseRoute(worker, group) {
  if (!group.ready || stopping) return;
  const now = Date.now();
  worker.crashes = worker.crashes.filter((time) => now - time < 30_000);
  worker.crashes.push(now);
  if (worker.crashes.length >= 5) {
    console.error(`[next-scriptc] ${worker.label}: giving up after 5 crashes within 30 seconds; restart Next to retry.`);
    return;
  }
  const delay = 500 * 2 ** (worker.crashes.length - 1);
  console.error(`[next-scriptc] ${worker.label}: restarting in ${delay} ms.`);
  setTimeout(() => {
    if (!stopping) startRoute(worker, group).catch((error) => console.error(error.message));
  }, delay).unref();
}

function startRoute(worker, group) {
  const { route } = worker;
  const child = spawn(path.join(group.distDir, "scriptc", route.binary), [], {
    cwd: group.projectDir,
    env: { ...process.env, PORT: String(route.port), NEXT_SCRIPTC_PARENT: String(process.pid) },
    stdio: ["ignore", "pipe", "inherit"],
  });
  worker.child = child;
  children.add(child);
  worker.exited = new Promise((resolve) => child.once("close", () => {
    children.delete(child);
    resolve();
    superviseRoute(worker, group);
  }));
  // One listener per child preserves chunk order without pipe's per-child
  // error/close listeners accumulating on the shared process.stdout stream.
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  return waitForReadiness(worker, group);
}

async function start(projectDir, distDir) {
  const manifest = await readManifest(distDir);
  if (!manifest.routes.length) return;
  installExitHooks();
  const group = { projectDir, distDir, ready: false, failure: undefined };
  const workers = manifest.routes.map((route) => ({
    route,
    label: `${route.pattern} (native port ${route.port}; check stderr for EADDRINUSE if occupied)`,
    crashes: [],
  }));
  try {
    await Promise.all(workers.map((worker) => startRoute(worker, group)));
    if (group.failure) throw group.failure;
    group.ready = true;
  } catch (error) {
    for (const { child } of workers) child.kill("SIGKILL");
    await Promise.all(workers.map(({ exited }) => exited));
    throw error;
  }
}

export function startNativeRoutes(projectDir, distDir) {
  if (!starts.has(distDir)) starts.set(distDir, start(projectDir, distDir));
  return starts.get(distDir);
}
