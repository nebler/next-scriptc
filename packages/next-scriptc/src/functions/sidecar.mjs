import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { existsSync } from "node:fs";

// Keep the transport announcement in one place for alternative transports.
function watchReadiness(child, timing, ready) {
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    if (timing && line.startsWith("scriptc-startup ")) console.error(line);
    const match = /^next-scriptc: listening on 127\.0\.0\.1:(\d+)$/.exec(line);
    if (match) ready(Number(match[1]));
  });
  return () => lines.close();
}

export function createSidecar(binary) {
  const state = { attempts: 0, ready: false, readyMs: null, pid: null };
  let child, pending, exited = false, everReady = false;
  function start() {
    state.attempts++;
    state.ready = false;
    state.readyMs = null;
    exited = false;
    const begin = performance.now();
    const timing = process.env.NEXT_SCRIPTC_STARTUP_TIMING === "1";
    if (timing) console.error("scriptc-startup " + JSON.stringify({ event: "spawn", monoMs: Number(process.hrtime.bigint()) / 1e6, uptimeMs: process.uptime() * 1000, cpu: process.cpuUsage() }));
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("VERCEL_IPC")));
    child = spawn(binary, [], { env: { ...env, PORT: "0", NEXT_SCRIPTC_PARENT: String(process.pid) }, stdio: ["ignore", "pipe", "inherit"] });
    state.pid = child.pid;
    pending = new Promise((resolve, reject) => {
      let closeReadiness;
      let settled = false;
      const finish = (error, port) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) { closeReadiness?.(); reject(error); }
        else {
          everReady = state.ready = true;
          state.readyMs = performance.now() - begin;
          if (timing) console.error("scriptc-startup " + JSON.stringify({ event: "observed-ready", elapsedMs: state.readyMs, monoMs: Number(process.hrtime.bigint()) / 1e6, uptimeMs: process.uptime() * 1000, cpu: process.cpuUsage() }));
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
      closeReadiness = watchReadiness(child, timing, (port) => finish(null, port));
      child.once("exit", () => closeReadiness());
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
export function startSidecar(binary = bundledBinary()) {
  return globalThis[key] ??= createSidecar(binary);
}
export const sidecar = process.env.VERCEL && !process.env.NEXT_SCRIPTC_VERCEL
  ? startSidecar()
  : null;
