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
    await Promise.all(manifest.routes.map((route) => {
      const label = `${route.pattern} (native port ${route.port}; check stderr for EADDRINUSE if occupied)`;
      let crashes = [];
      function launch() {
        return new Promise((resolve, reject) => {
          const child = spawn(path.join(distDir, "scriptc", route.binary), [], {
            cwd: projectDir,
            env: { ...process.env, PORT: String(route.port), NEXT_SCRIPTC_PARENT: String(process.pid) },
            stdio: ["ignore", "pipe", "inherit"],
          });
          children.add(child);
          const exited = new Promise((done) => child.once("close", () => {
            children.delete(child);
            done();
            if (!ready || stopping) return;
            const now = Date.now();
            crashes = crashes.filter((time) => now - time < 30_000);
            crashes.push(now);
            if (crashes.length >= 5) {
              console.error(`[next-scriptc] ${label}: giving up after 5 crashes within 30 seconds; restart Next to retry.`);
              return;
            }
            const delay = 500 * 2 ** (crashes.length - 1);
            console.error(`[next-scriptc] ${label}: restarting in ${delay} ms.`);
            setTimeout(() => {
              if (!stopping) launch().catch((error) => console.error(error.message));
            }, delay).unref();
          }));
          if (!ready) group.push({ child, exited });
          const lines = createInterface({ input: child.stdout });
          const timeout = setTimeout(() => {
            finish(new Error(`[next-scriptc] ${label} did not become ready within 30 seconds.`));
            child.kill("SIGKILL");
          }, 30_000);
          let settled = false;
          function finish(error) {
            if (error && !ready) failure = error;
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
            if (ready && settled && !stopping) console.error(error.message);
            finish(error);
          });
          lines.on("line", (line) => {
            if (line === `next-scriptc: listening on 127.0.0.1:${route.port}`) {
              console.log(`[next-scriptc] ${route.pattern} → native PID ${child.pid}, port ${route.port}`);
              finish();
            }
          });
          child.stdout.pipe(process.stdout);
        });
      }
      return launch();
    }));
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
