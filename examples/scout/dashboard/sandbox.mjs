// node --env-file=.env.local examples/scout/dashboard/sandbox.mjs
// Default: one vCPU, <=175 s timeout. Set LIFETIME_MS and LABEL for a
// separately budgeted follow-up. No deployments; always stop in finally.
import { Sandbox } from "@vercel/sandbox";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const lifetimeMs = Number(process.env.LIFETIME_MS ?? 175000);
if (lifetimeMs < 30000 || lifetimeMs > 175000) throw new Error("LIFETIME_MS must be 30000–175000");
const label = process.env.LABEL ?? "linux";
const localGo = process.env.GO ?? "/opt/homebrew/bin/go";
const goVersion = execFileSync(localGo, ["version"], { encoding: "utf8" }).trim();
execFileSync(localGo, ["build", "-o", path.join(import.meta.dirname, ".artifacts/go-linux"), path.join(import.meta.dirname, "dashboard.go")],
  { env: { ...process.env, GOOS: "linux", GOARCH: "amd64", CGO_ENABLED: "0" } });
const paths = ["examples/scout/dashboard/dashboard.ts", "examples/scout/dashboard/dashboard.go",
  "examples/scout/dashboard/run.mjs", "examples/demo/app/api/analytics/revenue/events.ts"];
const provenance = { startedAt: new Date().toISOString(), image: "vercel/sandbox/node:24", vcpus: 1,
  timeoutMs: lifetimeMs, maximumVcpuHours: lifetimeMs / 3600000, steps: [], status: "running" };
const started = Date.now();
const sandbox = await Sandbox.create({ image: provenance.image, resources: { vcpus: 1 }, timeout: lifetimeMs, persistent: false });
provenance.sandbox = sandbox.name;
console.log(`Sandbox ${sandbox.name}; hard cap ${provenance.maximumVcpuHours.toFixed(6)} vCPU-hours`);
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(new Error("Sandbox command deadline")), lifetimeMs - 20000);
timer.unref();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => controller.abort(new Error(signal)));
async function step(label, script, sudo = false) {
  const begin = Date.now();
  const r = await sandbox.runCommand({ cmd: "bash", args: ["-lc", `set -euo pipefail\n${script}`],
    cwd: sandbox.cwd, sudo, stdout: process.stdout, stderr: process.stderr, signal: controller.signal });
  provenance.steps.push({ label, elapsedMs: Date.now() - begin, exitCode: r.exitCode });
  if (r.exitCode !== 0) throw new Error(`${label}: exit ${r.exitCode}`);
}
try {
  await sandbox.writeFiles([
    ...paths.map(p => ({ path: p, content: readFileSync(path.join(root, p)) })),
    { path: "examples/scout/dashboard/.artifacts/go", content: readFileSync(path.join(import.meta.dirname, ".artifacts/go-linux")) },
    { path: "packages/next-scriptc/package.json", content: Buffer.from(JSON.stringify({ private: true, dependencies: { scriptc: "0.4.6" } })) },
  ], { signal: controller.signal });
  await step("System tools", `
    if ! command -v clang >/dev/null || ! test -x /usr/bin/time; then
      if command -v dnf >/dev/null; then dnf install -y -q clang time
      else apt-get update -qq && apt-get install -y -qq clang time; fi
    fi
    uname -a
    lscpu | head -20
    node --version
    clang --version`, true);
  await step("Install compiler and build", `
    npm install --prefix packages/next-scriptc --omit=dev --no-audit --no-fund --loglevel=error
    chmod +x examples/scout/dashboard/.artifacts/go
    SCRIPTC_CHECKER_SERVER=0 packages/next-scriptc/node_modules/.bin/scriptc build examples/scout/dashboard/dashboard.ts -o examples/scout/dashboard/.artifacts/native --optimization release`);
  await step("200k benchmark and phase profile", `
    SKIP_BUILD=1 GO_VERSION='${goVersion.replace("darwin/arm64", "linux/amd64 (cross-compiled on darwin/arm64)")}' SIZES=200000 ITERATIONS=30 WARMUP=5 RESULT=results.json node examples/scout/dashboard/run.mjs`);
  provenance.status = "complete";
} catch (error) {
  provenance.status = "failed";
  provenance.error = error.stack;
  process.exitCode = 1;
  console.error(error);
} finally {
  try {
    await sandbox.downloadFile({ path: "results.json", cwd: sandbox.cwd },
      { path: path.join(root, `research/scout-dashboard-${label}.json`) }, { signal: AbortSignal.timeout(10000) });
  } catch (error) { provenance.downloadError = error.message; }
  clearTimeout(timer);
  try {
    const stopped = await sandbox.stop({ signal: AbortSignal.timeout(15000) });
    provenance.stopped = true;
    provenance.activeCpuDurationMs = stopped.activeCpuDurationMs;
  } catch (error) { provenance.stopError = error.message; process.exitCode = 1; }
  provenance.elapsedMs = Date.now() - started;
  provenance.allocatedVcpuHoursUpperBound = Math.min(provenance.elapsedMs, provenance.timeoutMs) / 3600000;
  writeFileSync(path.join(root, `research/scout-dashboard-${label}-provenance.json`), JSON.stringify(provenance, null, 2) + "\n");
  console.log(JSON.stringify(provenance));
}
