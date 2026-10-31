// Bounded experiments. Secrets stay in this controller, never the archive/VM.
import { Sandbox } from "@vercel/sandbox";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../../..");
process.chdir(root);
const scout = process.argv.includes("--scout");
const label = process.argv.find(a => a.startsWith("--label="))?.slice(8) ?? (scout ? "scout-linux" : "route-before");
if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Invalid label");
const prefix = `research/benchmarks/vector-${label}`;
for (const suffix of [".json", "-controller.json"]) {
  try { await access(prefix + suffix); throw new Error("Evidence exists; inspect before any new experiment"); }
  catch (e) { if (e.code !== "ENOENT") throw e; }
}
if (process.env.NODE_OPTIONS || process.env.DEMO_PROXY_TIMEOUT_MS || process.env.SCRIPTC_COMPILER)
  throw new Error("Stock before requires untuned Node/default proxy and installed compiler");
const git = (...args) => execFileSync("git", args, { maxBuffer: 128 * 1024 * 1024 });
if (git("diff", "HEAD", "--", "examples/demo", "examples/scout/vectors", "packages/next-scriptc", "pnpm-lock.yaml").length)
  throw new Error("Commit measured source first");
const commit = git("rev-parse", "HEAD").toString().trim();
const vcpus = scout ? 1 : 2, lifetime = scout ? 330000 : 510000;
const report = { status: "running", sourceCommit: commit, startedAt: new Date().toISOString(), hardLifetimeMs: lifetime, vcpus, steps: [] };
const sha = b => createHash("sha256").update(b).digest("hex");
const save = () => writeFile(prefix + "-controller.json", JSON.stringify(report, null, 2) + "\n");
let sandbox;
const started = Date.now();
async function command(label, script, sudo = false) {
  const remaining = lifetime - (Date.now() - started) - 25000;
  if (remaining < 1000) throw new Error("Budget exhausted before " + label);
  const start = Date.now();
  const r = await sandbox.runCommand({ cmd: "bash", args: ["-lc", "set -euo pipefail\n" + script], cwd: sandbox.cwd, sudo, stdout: process.stdout, stderr: process.stderr, signal: AbortSignal.timeout(remaining) });
  report.steps.push({ label, exitCode: r.exitCode, elapsedMs: Date.now() - start });
  await save();
  if (r.exitCode !== 0) throw new Error(`${label}: exit ${r.exitCode}`);
}
try {
  const archive = git("archive", "--format=tar", "HEAD");
  report.archiveSha256 = sha(archive);
  sandbox = await Sandbox.create({ image: "vercel/sandbox/node:24", region: "iad1", resources: { vcpus }, timeout: lifetime, persistent: false });
  report.sandbox = { name: sandbox.name, region: sandbox.region };
  await save(); console.log("Sandbox", sandbox.name);
  const names = scout ? ["fair-go-linux", "fair-native-linux", "rss-linux"] : ["heavy-go-linux"];
  const files = await Promise.all(names.map(async name => {
    const content = await readFile(`.vercel/vector-tools/${name}`);
    report[name + "Sha256"] = sha(content);
    return { path: name, content, mode: 0o755 };
  }));
  await sandbox.writeFiles([{ path: "repo.tar", content: archive }, ...files]);
  await command("Unpack", "mkdir repo\ntar -xf repo.tar -C repo\nnode --version\nuname -a\nhead -26 /proc/cpuinfo\ncat /sys/fs/cgroup/cpu.max || true");
  if (scout) {
    await command("Scout paired orders", `mkdir -p repo/examples/scout/vectors/.artifacts\ncp fair-go-linux fair-native-linux rss-linux repo/examples/scout/vectors/.artifacts/\ncd repo\nBENCH_COMMIT=${commit} VECTOR_COMPILER_VERSION='scriptc 0.4.6 (cross-built release portable x86-64)' VECTOR_GO_VERSION='go1.27.3 cross-built CGO_ENABLED=0 GOEXPERIMENT=simd' node examples/scout/vectors/fair.mjs ../result.json --skip-build`);
  } else {
    await command("CPU/build tools", "if ! command -v clang >/dev/null || ! command -v taskset >/dev/null; then if command -v dnf >/dev/null; then dnf install -y -q clang util-linux; else apt-get update -qq && apt-get install -y -qq clang util-linux; fi; fi", true);
    await command("Frozen dependencies", "cd repo\nnpx -y pnpm@11.1.3 install --frozen-lockfile --reporter=silent\nnode node_modules/.pnpm/scriptc@0.4.6/node_modules/scriptc/scripts/install-native.mjs\ncp ../heavy-go-linux examples/demo/go/user-server\nchmod +x examples/demo/go/user-server");
    await command("Build stock native and Node", "cd repo\nSCRIPTC_CHECKER_SERVER=0 NEXT_SCRIPTC_DEMO_GROUPS=vercel HEAVY_GO_ORIGIN=http://127.0.0.1:3520 npx -y pnpm@11.1.3 --filter demo build\nNEXT_SCRIPTC_BASELINE=node NEXT_SCRIPTC_DEMO_GROUPS= HEAVY_GO_ORIGIN=http://127.0.0.1:3520 npx -y pnpm@11.1.3 --filter demo build");
    await command("Vector production suite", `cd repo\nBENCH_COMMIT=${commit} HEAVY_VECTOR_SUITE=1 HEAVY_WORKLOADS=vectors,vectors-imul HEAVY_APP_CPUS=0 taskset -c 1 node examples/demo/bench/heavy/self.mjs ../result.json`);
  }
  report.status = "complete";
} catch (e) {
  report.status = "failed"; report.error = String(e); console.error(e); process.exitCode = 1;
} finally {
  if (sandbox) {
    try {
      const data = await sandbox.readFileToBuffer({ path: "result.json" }, { signal: AbortSignal.timeout(5000) });
      if (!data) throw new Error("No worker artifact");
      await writeFile(prefix + ".json", data);
      if (JSON.parse(data).status !== "complete") report.status = "failed";
    } catch (e) { report.downloadError = String(e); report.status = "failed"; }
    try {
      const stopped = await sandbox.stop({ signal: AbortSignal.timeout(10000) });
      report.stopped = true; report.activeCpuDurationMs = stopped.activeCpuDurationMs;
    } catch (e) { report.stopError = String(e); report.status = "failed"; }
  }
  report.elapsedMs = Date.now() - started;
  report.provisionedVcpuHoursReservation = lifetime * vcpus / 3600000;
  report.observedWallVcpuHours = report.elapsedMs * vcpus / 3600000;
  await save(); console.log(prefix, report.status, report.observedWallVcpuHours);
  if (report.status !== "complete") process.exitCode = 1;
}
