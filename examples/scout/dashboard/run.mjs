// Node 24: node examples/scout/dashboard/run.mjs
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { revenueEventsJson } from "../../demo/app/api/analytics/revenue/events.ts";

const dir = import.meta.dirname;
const root = path.resolve(dir, "../../..");
const artifacts = path.join(dir, ".artifacts");
mkdirSync(artifacts, { recursive: true });
const native = path.join(artifacts, "native");
const go = path.join(artifacts, "go");
const goTool = process.env.GO ?? "/opt/homebrew/bin/go";
const compiler = path.join(root, "packages/next-scriptc/node_modules/.bin/scriptc");
const node = process.env.NODE ?? process.execPath;
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: "utf8", timeout: 180_000,
  env: { ...process.env, SCRIPTC_CHECKER_SERVER: "0" } }).trim();
if (process.env.SKIP_BUILD !== "1") {
  console.log(run(compiler, ["build", path.join(dir, "dashboard.ts"), "-o", native, "--optimization", "release"]));
  run(goTool, ["build", "-o", go, path.join(dir, "dashboard.go")]);
}
const sha = (value) => createHash("sha256").update(value).digest("hex");
const iterations = Number(process.env.ITERATIONS ?? 40);
const warmup = Number(process.env.WARMUP ?? 10);
const sizes = (process.env.SIZES ?? "5000,50000,200000").split(",").map(Number);
const percentile = (xs, p) => [...xs].sort((a,b) => a-b)[Math.ceil(xs.length * p) - 1];
const summarize = (xs) => ({ medianMs: percentile(xs, .5), p95Ms: percentile(xs, .95) });
const result = { date: new Date().toISOString(), platform: process.platform, arch: process.arch,
  cpu: os.cpus()[0].model, loadStart: os.loadavg(), node: run(node, ["--version"]),
  go: process.env.GO_VERSION ?? run(goTool, ["version"]), scriptc: run(compiler, ["--version"]),
  sourceSha256: sha(readFileSync(path.join(dir, "dashboard.ts"))),
  goSourceSha256: sha(readFileSync(path.join(dir, "dashboard.go"))),
  binarySha256: sha(readFileSync(native)), iterations, warmup, runs: [], parity: [] };
const variants = ["node", "native", "go", "go-stream", "go-v2"];
function measure(variant, input, output, profile = false, extra = {}) {
  const command = variant === "node" ? [node, path.join(dir, "dashboard.ts")]
    : [variant === "native" ? native : go];
  const args = process.platform === "darwin" ? ["-l", ...command] : ["-v", ...command];
  const child = spawnSync("/usr/bin/time", args, { cwd: root, encoding: "utf8", timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, INPUT: input, OUTPUT: output, ITERATIONS: String(iterations),
      WARMUP: String(warmup), PROFILE: profile ? "1" : "0", VARIANT: variant === "go-stream" ? "stream" : variant === "go-v2" ? "v2" : "typed", ...extra } });
  if (child.status !== 0) throw new Error(`${variant}: ${child.error ?? child.stderr}\n${child.stdout}`);
  const metrics = JSON.parse(child.stdout.trim());
  const rss = process.platform === "darwin" ? child.stderr.match(/(\d+)\s+maximum resident set size/)
    : child.stderr.match(/Maximum resident set size \(kbytes\):\s*(\d+)/);
  if (!rss) throw new Error(`RSS missing: ${child.stderr}`);
  return { ...metrics, ...summarize(metrics.samples),
    peakRssMiB: Number(rss[1]) / (process.platform === "darwin" ? 1024 * 1024 : 1024),
    timeStderr: child.stderr,
    phaseMedians: metrics.phases.length ? Object.fromEntries(Object.keys(metrics.phases[0]).map(
      key => [key, percentile(metrics.phases.map(p => p[key]), .5)])) : null };
}

for (const [index, size] of sizes.entries()) {
  const input = path.join(artifacts, `${size}.json`);
  const fixture = revenueEventsJson(size);
  writeFileSync(input, fixture);
  const output = path.join(artifacts, "output.json");
  let expected;
  const order = variants.slice(index).concat(variants.slice(0, index));
  for (const variant of order) {
    const row = { variant, size, inputBytes: Buffer.byteLength(fixture), inputSha256: sha(fixture),
      ...measure(variant, input, output) };
    const actual = readFileSync(output);
    expected ??= actual;
    if (!expected.equals(actual)) throw new Error(`byte parity failed: ${variant}/${size}`);
    row.outputSha256 = sha(actual);
    row.outputBytes = actual.length;
    result.runs.push(row);
    console.log(`${variant} ${size}: ${row.medianMs.toFixed(3)} / ${row.p95Ms.toFixed(3)} ms; ${row.peakRssMiB.toFixed(1)} MiB`);
  }
  result.parity.push({ size, sha256: sha(expected), bytes: expected.length, variants });
}
// Additional parity checks exercise filtering, zero matches, an empty array,
// reordered buckets, and JSON-escaped strings. No benchmark uses these inputs.
const checks = [
  { name: "partial", input: revenueEventsJson(5000), FROM: "2026-01-07", TO: "2026-01-13" },
  { name: "none", input: revenueEventsJson(20), FROM: "2027", TO: "2028" },
  { name: "empty", input: "[]" },
  { name: "escapes", input: JSON.stringify([
    { day: "2026-01-02", region: 'z"\\\n', amountCents: 20, quantity: 3 },
    { day: "2026-01-01", region: "a", amountCents: 11, quantity: 2 },
    { day: "2026-01-02", region: 'z"\\\n', amountCents: 7, quantity: 1 },
  ]) },
];
for (const check of checks) {
  const input = path.join(artifacts, "check.json"), output = path.join(artifacts, "check-output.json");
  writeFileSync(input, check.input);
  let expected;
  for (const variant of variants) {
    measure(variant, input, output, false, { ITERATIONS: "1", WARMUP: "0", FROM: check.FROM ?? "2026-01-01", TO: check.TO ?? "2026-01-31" });
    const actual = readFileSync(output); expected ??= actual;
    if (!expected.equals(actual)) throw new Error(`byte parity failed: ${variant}/${check.name}`);
  }
  result.parity.push({ case: check.name, sha256: sha(expected), bytes: expected.length, variants });
}
result.profiles = [];
if (process.env.PROFILES !== "0") {
  const size = sizes.at(-1), input = path.join(artifacts, `${size}.json`), output = path.join(artifacts, "profile-output.json");
  for (const variant of variants) result.profiles.push({ variant, size, ...measure(variant, input, output, true) });
}
result.loadEnd = os.loadavg();
const destination = path.resolve(process.env.RESULT ?? path.join(root, `research/scout-dashboard-${process.platform}.json`));
writeFileSync(destination, JSON.stringify(result, null, 2) + "\n");
console.log(destination);
