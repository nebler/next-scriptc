// Benchmarks committed HEAD only. At most 2 vCPUs * 7.5 minutes = 0.25
// vCPU-hours, including installation/builds. Always stop; never upload secrets.
// node --env-file=.env.local scripts/sandbox-functions.mjs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Sandbox } from "@vercel/sandbox";

const root = path.resolve(import.meta.dirname, "..");
const git = (...args) => execFileSync("git", args, { cwd: root, maxBuffer: 128 * 1024 * 1024 });
const commit = git("rev-parse", "HEAD").toString().trim();
git("cat-file", "-e", "HEAD:examples/demo/bench/function-profile.ts");
const archive = git("archive", "--format=tar", "HEAD");
const archiveSha256 = createHash("sha256").update(archive).digest("hex");
const stamp = new Date().toISOString().replaceAll(":", "-");
const destination = path.join(root, "research/benchmarks", `functions-linux-${stamp}`);
const controller = new AbortController();
for (const name of ["SIGINT", "SIGTERM"]) process.once(name, () => controller.abort(new Error(name)));
const started = Date.now();
const sandbox = await Sandbox.create({ image: "vercel/sandbox/node:24", resources: { vcpus: 2 }, timeout: 7.5 * 60 * 1000, persistent: false });
const deadline = setTimeout(() => controller.abort(new Error("7 minute command budget exhausted")), 7 * 60 * 1000);
deadline.unref();
const provenance = { sandbox: sandbox.name, cwd: sandbox.cwd, commit, archiveSha256, startedAt: new Date(started).toISOString(), image: "vercel/sandbox/node:24", vcpus: 2, memoryMiB: 4096,
  lifetimeMs: 7.5 * 60 * 1000, maxVcpuHours: 2 * 7.5 / 60, affinity: "app and native: CPU 0; load generator: CPU 1; C=1", status: "running", steps: [] };
console.log(`Sandbox ${sandbox.name}; HEAD ${commit}; maximum 0.25 vCPU-hours`);
async function step(label, script, sudo = false) {
  const begin = Date.now();
  const result = await sandbox.runCommand({ cmd: "bash", cwd: sandbox.cwd, args: ["-lc", `set -euo pipefail\n${script}`], sudo, stdout: process.stdout, stderr: process.stderr, signal: controller.signal });
  provenance.steps.push({ label, elapsedMs: Date.now() - begin, exitCode: result.exitCode });
  if (result.exitCode !== 0) throw new Error(`${label}: exit ${result.exitCode}`);
}
try {
  await sandbox.writeFiles([{ path: "repo.tar", content: archive }], { signal: controller.signal });
  await step("Compiler and affinity tools", `
    if ! command -v clang >/dev/null || ! command -v taskset >/dev/null; then
      if command -v dnf >/dev/null; then dnf install -y -q clang util-linux
      else apt-get update -qq && apt-get install -y -qq clang util-linux; fi
    fi
    node --version
    clang --version
    lscpu | head -20`, true);
  await step("Exact lockfile install", `
    pwd
    mkdir next-scriptc
    tar -xf repo.tar -C next-scriptc
    cd next-scriptc
    test "$(sha256sum ../repo.tar | cut -d ' ' -f1)" = '${archiveSha256}'
    timeout 120s npx -y pnpm@11.1.3 install --frozen-lockfile --reporter=silent
    find node_modules/.pnpm -type f \\( -name tsc-ts -o -name tsc -o -name scriptc-comptime \\) -exec chmod +x {} +
    packages/next-scriptc/node_modules/.bin/scriptc --version`);
  await step("Native and Node production builds", `
    cd next-scriptc
    SCRIPTC_CHECKER_SERVER=0 NEXT_SCRIPTC_BASELINE= timeout 240s npx -y pnpm@11.1.3 --filter demo build
    NEXT_SCRIPTC_BASELINE=node timeout 90s npx -y pnpm@11.1.3 --filter demo build`);
  await step("Page curve, profile and overhead", `
    cd next-scriptc
    BENCH_COMMIT='${commit}' FUNCTION_SERVER_CPU=0 FUNCTION_BENCH_CALLS=1000 FUNCTION_BENCH_PAGES=200 FUNCTION_BENCH_WARMUP=50 \
      timeout --signal=TERM --kill-after=5s 180s taskset -c 1 node examples/demo/bench/functions.mjs --skip-build --output=../functions.json`);
  provenance.status = "complete";
} catch (error) {
  provenance.status = "failed";
  provenance.error = error.stack;
  process.exitCode = 1;
  console.error(error);
} finally {
  try {
    await mkdir(path.dirname(destination), { recursive: true });
    const saved = await sandbox.downloadFile({ path: "functions.json", cwd: sandbox.cwd }, { path: `${destination}.json` }, { signal: AbortSignal.timeout(15_000) });
    if (!saved) throw new Error("No results file");
  } catch (error) {
    provenance.status = "failed";
    provenance.downloadError = error.message;
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
    try {
      const stopped = await sandbox.stop({ signal: AbortSignal.timeout(20_000) });
      provenance.activeCpuDurationMs = stopped.activeCpuDurationMs;
      provenance.stopped = true;
    } catch (error) {
      provenance.status = "failed";
      provenance.stopError = error.message;
      process.exitCode = 1;
    }
    provenance.elapsedMs = Date.now() - started;
    provenance.allocatedVcpuHoursUpperBound = 2 * Math.min(provenance.elapsedMs, provenance.lifetimeMs) / 3600000;
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(`${destination}.provenance.json`, JSON.stringify(provenance, null, 2) + "\n");
    console.log(`Stopped: ${provenance.stopped}; results ${destination}; ${provenance.allocatedVcpuHoursUpperBound.toFixed(3)} allocated vCPU-hours upper bound`);
  }
}
