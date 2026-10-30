import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { request } from "./load.mjs";

export const exec = promisify(execFile);
const owned = new Set();
const controller = new AbortController();
export const signal = controller.signal;
for (const name of ["SIGINT", "SIGTERM"]) process.once(name, () => controller.abort(new Error(name)));
let ticks, pageSize;
if (process.platform === "linux") {
  ticks = Number((await exec("getconf", ["CLK_TCK"])).stdout.trim());
  pageSize = Number((await exec("getconf", ["PAGESIZE"])).stdout.trim());
}
export const accounting = { cpuTicksPerSecond: ticks, rssPageBytes: pageSize, peakSamplingIntervalMs: 100 };

export function start(command, args, { cwd, env = {}, cpus, role = "entry-or-supervisor" } = {}) {
  signal.throwIfAborted();
  const started = performance.now();
  const child = spawn(cpus ? "taskset" : command, cpus ? ["-c", cpus, command, ...args] : args, {
    cwd, env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", ...env },
    detached: true, stdio: ["ignore", "pipe", "pipe"],
  });
  const proc = { child, started, role, output: "", stdout: "", done: false, knownPids: new Set() };
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => {
    proc.output = (proc.output + chunk).slice(-64_000);
    if (stream === child.stdout) proc.stdout += chunk;
  });
  proc.exited = new Promise((resolve) => {
    child.once("error", (error) => { proc.error = error; proc.done = true; });
    child.once("exit", (code) => { proc.code = code; proc.done = true; });
    // close follows exit/error and the draining of stdout/stderr.
    child.once("close", resolve);
  });
  owned.add(proc);
  return proc;
}

export async function portsFree(ports) {
  for (const port of new Set(ports)) {
    const server = createServer();
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
    await new Promise((resolve) => server.close(resolve));
  }
}

export async function ready(proc, base, spec) {
  while (performance.now() - proc.started < 120_000) {
    signal.throwIfAborted();
    if (proc.done) throw new Error(`Process exited (${proc.code}): ${proc.error ?? proc.output}`);
    try {
      const response = await request(base, spec);
      return { ...response, coldMs: performance.now() - proc.started };
    } catch (error) {
      if (!/ECONNREFUSED|ECONNRESET|socket hang up/.test(String(error))) throw error;
    }
    await delay(2, undefined, { signal });
  }
  throw new Error(`Readiness timed out: ${proc.output}`);
}

function timeMs(value) {
  const [days, clock] = value.includes("-") ? value.split("-") : ["0", value];
  return (Number(days) * 86400 + clock.split(":").reduce((sum, part) => sum * 60 + Number(part), 0)) * 1000;
}

export async function census(proc) {
  // ps finds descendants even when the adapter creates separate process groups.
  const { stdout } = await exec("ps", ["-axo", "pid=,ppid=,rss=,time=,command="], { maxBuffer: 16 * 1024 * 1024 });
  const all = stdout.trim().split("\n").map((line) => {
    const [, pid, ppid, rss, cpu, command] = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/) ?? [];
    return { pid: Number(pid), ppid: Number(ppid), rssBytes: Number(rss) * 1024, cpuMs: timeMs(cpu ?? "0"), command };
  });
  const ids = new Set([proc.child.pid]);
  let previous;
  do {
    previous = ids.size;
    for (const row of all) if (ids.has(row.ppid)) ids.add(row.pid);
  } while (ids.size !== previous);
  const rows = all.filter((row) => ids.has(row.pid));
  for (const row of rows) {
    proc.knownPids.add(row.pid);
    if (process.platform === "linux") {
      const stat = await readFile(`/proc/${row.pid}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
      // fields start at stat field 3: utime=14, stime=15, rss=24.
      row.cpuMs = (Number(fields[11]) + Number(fields[12])) * 1000 / ticks;
      row.rssBytes = Number(fields[21]) * pageSize;
    }
    row.role = row.pid === proc.child.pid ? proc.role : /route-\d+/.test(row.command) ? "native-route" : /next-server|next.*start/.test(row.command) ? "next-server" : "descendant";
  }
  if (!rows.length) throw new Error(`Measured process exited: ${proc.output}`);
  return { processes: rows, rssBytes: rows.reduce((sum, row) => sum + row.rssBytes, 0), cpuMs: rows.reduce((sum, row) => sum + row.cpuMs, 0) };
}

function kill(pid, sig, group = false) {
  if (!Number.isInteger(pid)) return;
  try { process.kill(group ? -pid : pid, sig); } catch (error) { if (error.code !== "ESRCH") throw error; }
}

export async function stop(proc) {
  if (!proc) return;
  // Record detached descendants before the supervisor can exit/reparent them.
  if (!proc.done) await census(proc).catch(() => {});
  kill(proc.child.pid, "SIGTERM", true);
  await Promise.race([proc.exited, delay(6000, undefined, { ref: false })]);
  for (const pid of proc.knownPids) {
    kill(pid, "SIGKILL", true);
    kill(pid, "SIGKILL");
  }
  if (!proc.done) kill(proc.child.pid, "SIGKILL", true);
  await proc.exited;
  owned.delete(proc);
}

export async function finish(proc) {
  try {
    signal.throwIfAborted();
    await Promise.race([proc.exited, new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error("Child exceeded 5 minute limit")), 300_000);
      timer.unref();
      proc.exited.then(() => clearTimeout(timer));
    }), new Promise((_, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      proc.exited.then(() => signal.removeEventListener("abort", abort));
    })]);
    if (proc.error || proc.code !== 0) throw new Error(`Child failed (${proc.code}): ${proc.error ?? proc.output}`);
    return JSON.parse(proc.stdout);
  } finally { await stop(proc); }
}

export async function cleanup() { for (const proc of [...owned].reverse()) await stop(proc); }

export async function measure(proc, work) {
  const before = await census(proc);
  let peak = before;
  let sampling = Promise.resolve();
  let samplingError;
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    sampling = census(proc).then((sample) => {
      if (sample.rssBytes > peak.rssBytes) peak = sample;
    }).catch((error) => { samplingError = error; }).finally(() => { busy = false; });
  }, 100);
  try {
    const result = await work();
    clearInterval(timer);
    await sampling;
    if (samplingError) throw samplingError;
    const after = await census(proc);
    if (after.rssBytes > peak.rssBytes) peak = after;
    // A missing/extra process would make delta-of-totals misleading.
    if (before.processes.map((p) => p.pid).sort().join() !== after.processes.map((p) => p.pid).sort().join()) throw new Error("Process tree changed during sample");
    return { result, before, after, peak, cpuMs: after.cpuMs - before.cpuMs };
  } finally { clearInterval(timer); await sampling; }
}
