// Focused hello transport/generator check, independent of the full suite.
// node examples/demo/bench/diagnose.mjs > research/benchmarks/transport-check.json
import path from "node:path";
import { readFile } from "node:fs/promises";
import { start, ready, stop, finish, measure, portsFree, cleanup } from "./processes.mjs";
const demo = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(path.join(demo, ".next/scriptc/manifest.json"), "utf8"));
const index = manifest.routes.findIndex((r) => r.pattern === "/api/hello");
const route = manifest.routes[index];
const spec = { path: "/api/hello" }, base = `http://127.0.0.1:${route.port}`;
const rows = [];
try {
  for (const runtime of ["node", "native"]) {
    await portsFree([route.port]);
    const server = start(runtime === "node" ? process.execPath : path.join(demo, ".next/scriptc", route.binary),
      runtime === "node" ? [path.join(demo, ".next/scriptc", `entry-${index}.ts`)] : [], { cwd: demo, env: { PORT: String(route.port) } });
    try {
      await ready(server, base, spec);
      for (const [name, options, sampled] of [
        ["original-300ms", { durationMs: 300 }, false],
        ["original-300ms-sampled", { durationMs: 300 }, true],
        ["sequential-400", { count: 400 }, false],
        ["warm-400-sampled", { count: 400, warmupMs: 1000 }, true],
        ["warm-1000ms-sampled", { durationMs: 1000, warmupMs: 1000 }, true],
      ]) {
        const work = () => finish(start(process.execPath, [path.join(demo, "bench/load.mjs"), JSON.stringify({ base, spec, concurrency: 1, ...options })], { cwd: demo }));
        const result = sampled ? (await measure(server, work)).result : await work();
        rows.push({ runtime, name, ...result });
      }
    } finally { await stop(server); await portsFree([route.port]); }
  }
} finally { await cleanup(); }
console.log(JSON.stringify({ node: process.version, note: "Loaded local machine; diagnostic only. Sampled includes ps every 100 ms; latency timer never includes process startup.", rows }, null, 2));
