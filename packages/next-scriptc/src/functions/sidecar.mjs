import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { existsSync } from "node:fs";

export function createSidecar(binary) {
  const state = { attempts: 0, ready: false, readyMs: null, pid: null };
  let child, pending, exited = false, everReady = false;
  function start() {
    state.attempts++;
    state.ready = false;
    exited = false;
    const begin = performance.now();
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("VERCEL_IPC")));
    child = spawn(binary, [], { env: { ...env, PORT: "0", NEXT_SCRIPTC_PARENT: String(process.pid) }, stdio: ["ignore", "pipe", "inherit"] });
    state.pid = child.pid;
    pending = new Promise((resolve, reject) => {
      const lines = createInterface({ input: child.stdout });
      let settled = false;
      const finish = (error, port) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        lines.close();
        if (error) reject(error);
        else {
          everReady = state.ready = true;
          state.readyMs = performance.now() - begin;
          resolve(port);
        }
      };
      const timer = setTimeout(() => {
        finish(new Error("[next-scriptc] Native functions sidecar startup timed out"));
        child.kill("SIGKILL");
      }, 30_000);
      child.once("error", (cause) => finish(new Error(`[next-scriptc] Cannot start native functions sidecar: ${cause.message}`, { cause })));
      child.once("exit", (code, signal) => {
        exited = true;
        state.ready = false;
        finish(new Error(`[next-scriptc] Native functions sidecar exited (${signal ?? code})`));
      });
      lines.on("line", (line) => {
        const match = /^next-scriptc: listening on 127\.0\.0\.1:(\d+)$/.exec(line);
        if (match) finish(null, Number(match[1]));
      });
    });
    // Eager startup can fail before a caller exists. Preserve that rejection.
    pending.catch(() => {});
    return pending;
  }
  const stop = () => child?.kill("SIGKILL");
  process.once("exit", stop);
  start();
  return {
    state,
    port() {
      if (exited && everReady) {
        if (state.attempts >= 2) return Promise.reject(new Error("[next-scriptc] Native functions sidecar exited after restart"));
        return start();
      }
      return pending;
    },
    stop() { process.removeListener("exit", stop); stop(); },
  };
}

// Multiple server chunks must not create separate children in one instance.
const key = Symbol.for("next-scriptc.functions.sidecar");
function bundledBinary() {
  // The Next launcher chdirs into the app, below the function's bundle root.
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    const file = path.join(dir, "scriptc-functions");
    if (existsSync(file)) return file;
    if (path.dirname(dir) === dir) break;
  }
  return path.join(process.env.LAMBDA_TASK_ROOT || process.cwd(), "scriptc-functions");
}
export const sidecar = process.env.VERCEL && !process.env.NEXT_SCRIPTC_VERCEL
  ? (globalThis[key] ??= createSidecar(bundledBinary()))
  : null;
