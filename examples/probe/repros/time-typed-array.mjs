// Run after application builds/benchmarks, never concurrently with timed work.
// REPRO_NODE=/absolute/path/to/node24 node examples/probe/repros/time-typed-array.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
const root = path.resolve(import.meta.dirname, "../../..");
const source = path.join(import.meta.dirname, "typed-array-histogram.ts");
const out = path.join(root, "examples/probe/.artifacts/typed-array-final");
mkdirSync(out, { recursive: true });
const node = process.env.REPRO_NODE ?? process.execPath;
const compiler = path.join(root, "packages/next-scriptc/node_modules/.bin/scriptc");
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: "utf8", timeout: 180_000,
  env: { ...process.env, SCRIPTC_CHECKER_SERVER: "0" } });
const nodeVersion = run(node, ["--version"]).trim();
if (!nodeVersion.startsWith("v24.")) throw new Error(`Use Node 24, got ${nodeVersion}`);
const data = { sourceSha256: createHash("sha256").update(readFileSync(source)).digest("hex"),
  date: new Date().toISOString(), platform: process.platform, arch: process.arch, cpu: os.cpus()[0].model,
  node: nodeVersion, scriptc: run(compiler, ["--version"]).trim(), warmups: 100, callsPerWindow: 500,
  windowsPerProcess: 3, loadAverageStart: os.loadavg(), commands: [], builds: [], runs: [] };
for (const mode of ["release", "speed"]) {
  const args = ["build", source, "-o", path.join(out, mode), "--optimization", mode, "--strip", "--no-keep-llvm"];
  const start = performance.now();
  data.commands.push([compiler, ...args]);
  const stdout = run(compiler, args);
  data.builds.push({ mode, ms: performance.now() - start, stdout });
}
const coverageArgs = ["coverage", source, "--explain-dynamic"];
data.commands.push([compiler, ...coverageArgs]);
data.coverage = run(compiler, coverageArgs);
writeFileSync(path.join(out, "coverage.txt"), data.coverage);
let expected;
for (const order of [["node", "release", "speed"], ["speed", "node", "release"], ["release", "speed", "node"]]) {
  for (const runtime of order) {
    const command = runtime === "node" ? [node, source] : [path.join(out, runtime)];
    data.commands.push(command);
    const rows = run(command[0], command.slice(1)).trim().split("\n").map((line) => JSON.parse(line));
    for (const row of rows) {
      expected ??= row.expected;
      if (row.expected !== expected || row.count !== 500) throw new Error("parity/count");
    }
    data.runs.push({ runtime, order, rows });
  }
}
data.loadAverageEnd = os.loadavg();
const median = (xs) => { const sorted = [...xs].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
data.summary = Object.fromEntries(["node", "release", "speed"].map((runtime) => {
  const times = data.runs.filter((r) => r.runtime === runtime).flatMap((r) => r.rows.map((row) => row.ms / row.count));
  return [runtime, { medianMs: median(times), minMs: Math.min(...times), maxMs: Math.max(...times), windows: times.length }];
}));
const file = path.join(import.meta.dirname, "typed-array-histogram-results.json");
writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
console.log(JSON.stringify({ file, expected, summary: data.summary, coverage: data.coverage }, null, 2));
