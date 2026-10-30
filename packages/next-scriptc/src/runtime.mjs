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

async function start(projectDir, distDir) {
  const manifest = await readManifest(distDir);
  if (!manifest.routes.length) return;
  if (!hooksInstalled) {
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
  const group = [];
  let ready = false;
  let failure;
  try {
    await Promise.all(manifest.routes.map((route) => new Promise((resolve, reject) => {
      const label = `${route.pattern} (native port ${route.port}; check stderr for EADDRINUSE if occupied)`;
      const child = spawn(path.join(distDir, "scriptc", route.binary), [], {
        cwd: projectDir,
        env: { ...process.env, PORT: String(route.port), NEXT_SCRIPTC_PARENT: "1" },
        // The unwritten stdin pipe is a lifetime lease, including parent SIGKILL.
        stdio: ["pipe", "pipe", "inherit"],
      });
      children.add(child);
      const exited = new Promise((done) => child.once("close", () => {
        children.delete(child);
        done();
      }));
      group.push({ child, exited });
      const lines = createInterface({ input: child.stdout });
      const timeout = setTimeout(() => finish(new Error(`[next-scriptc] ${label} did not become ready within 30 seconds.`)), 30_000);
      function finish(error) {
        clearTimeout(timeout);
        lines.close();
        if (error) reject(error);
        else resolve();
      }
      child.once("error", (cause) => {
        failure = new Error(`[next-scriptc] Cannot start ${label}`, { cause });
        finish(failure);
      });
      child.once("exit", (code, signal) => {
        const error = new Error(`[next-scriptc] ${label} exited (${signal ?? `exit ${code}`}).`);
        failure = error;
        finish(error);
        if (ready && !stopping) {
          console.error(error);
          process.exit(1);
        }
      });
      lines.on("line", (line) => {
        if (line === `next-scriptc: listening on 127.0.0.1:${route.port}`) {
          console.log(`[next-scriptc] ${route.pattern} → native PID ${child.pid}, port ${route.port}`);
          finish();
        }
      });
      child.stdout.pipe(process.stdout);
    })));
    if (failure) throw failure;
    ready = true;
  } catch (error) {
    for (const { child } of group) child.kill("SIGKILL");
    await Promise.all(group.map(({ exited }) => exited));
    throw error;
  }
}

export function startNativeRoutes(projectDir, distDir) {
  if (!starts.has(distDir)) starts.set(distDir, start(projectDir, distDir));
  return starts.get(distDir);
}
