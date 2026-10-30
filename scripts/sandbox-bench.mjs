// Benchmarks git HEAD only. Integrate and commit the suite/routes first.
// Run: node --env-file=.env.local scripts/sandbox-bench.mjs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { Sandbox } from "@vercel/sandbox";

const root = path.resolve(import.meta.dirname, "..");
const { values } = parseArgs({ options: { reverse: { type: "boolean", default: false } } });
const git = (...args) => execFileSync("git", args, { cwd: root, maxBuffer: 128 * 1024 * 1024 });
// Fail before provisioning if HEAD cannot run the suite. No local patches,
// ignored files, secrets or node_modules are uploaded.
git("cat-file", "-e", "HEAD:examples/demo/bench/run.mjs");
const commit = git("rev-parse", "HEAD").toString().trim();
const archive = git("archive", "--format=tar", "HEAD");
const archiveSha256 = createHash("sha256").update(archive).digest("hex");
const stamp = new Date().toISOString().replaceAll(":", "-");
const destination = path.join(root, "research/benchmarks", `${stamp}-sandbox-${commit.slice(0, 12)}`);
const controller = new AbortController();
for (const name of ["SIGINT", "SIGTERM"]) process.once(name, () => controller.abort(new Error(name)));
const started = Date.now();
const deadline = setTimeout(() => controller.abort(new Error("28 minute benchmark budget exhausted")), 28 * 60 * 1000);
deadline.unref();
const sandbox = await Sandbox.create({
  image: "vercel/sandbox/node:24", resources: { vcpus: 4 },
  timeout: 30 * 60 * 1000, persistent: false,
});
const provenance = { sandbox: sandbox.name, commit, archiveSha256, startedAt: new Date(started).toISOString(),
  image: "vercel/sandbox/node:24", vcpus: 4, memoryMiB: 8192, reverse: values.reverse, status: "running", steps: [] };
console.log(`Sandbox ${sandbox.name}; HEAD ${commit}; archive SHA-256 ${archiveSha256}`);

async function step(label, script, sudo = false) {
  console.log(`\n${label}`);
  const start = Date.now();
  const result = await sandbox.runCommand({ cmd: "bash", args: ["-lc", `set -euo pipefail\n${script}`], sudo,
    stdout: process.stdout, stderr: process.stderr, signal: controller.signal });
  provenance.steps.push({ label, elapsedMs: Date.now() - start, exitCode: result.exitCode });
  if (result.exitCode !== 0) throw new Error(`${label}: exit ${result.exitCode}`);
}

try {
  await sandbox.writeFiles([{ path: "repo.tar", content: archive }]);
  await step("Install compiler and CPU affinity tools", `
    if ! command -v clang >/dev/null || ! command -v taskset >/dev/null; then
      if command -v dnf >/dev/null; then dnf install -y -q clang util-linux
      else apt-get update -qq && apt-get install -y -qq clang util-linux; fi
    fi
    node --version
    clang --version
    nproc
    cat /proc/meminfo | head -3`, true);
  await step("Install exact lockfile", `
    mkdir next-scriptc
    tar -xf repo.tar -C next-scriptc
    cd next-scriptc
    test "$(sha256sum ../repo.tar | cut -d ' ' -f1)" = '${archiveSha256}'
    npx -y pnpm@11.1.3 install --frozen-lockfile --reporter=silent
    packages/next-scriptc/node_modules/.bin/scriptc --version`);
  // Sequential, with real exit status preserved. Never hide compiler failures
  // behind grep/"|| true" or build the two Next outputs concurrently.
  await step("Native production build", "cd next-scriptc && timeout 600s npx -y pnpm@11.1.3 --filter demo build");
  await step("Node production build", "cd next-scriptc && NEXT_SCRIPTC_BASELINE=node timeout 300s npx -y pnpm@11.1.3 --filter demo build");
  await step("Full benchmark", `cd next-scriptc && BENCH_COMMIT='${commit}' BENCH_ARCHIVE_SHA256='${archiveSha256}' timeout --signal=TERM --kill-after=15s 900s node examples/demo/bench/run.mjs --output /vercel/sandbox/bench-results${values.reverse ? " --reverse" : ""}`);
  provenance.status = "complete";
} catch (error) {
  provenance.status = "failed";
  provenance.error = error.stack;
  process.exitCode = 1;
  console.error(error);
} finally {
  // Download partial reports too when the suite caught a measurement failure.
  // A failed download must never prevent stop().
  try {
    await mkdir(path.dirname(destination), { recursive: true });
    for (const extension of ["json", "md"]) {
      const saved = await sandbox.downloadFile({ path: `/vercel/sandbox/bench-results.${extension}` }, { path: `${destination}.${extension}` });
      if (!saved) {
        console.warn(`No ${extension} results (build/startup may have failed).`);
        provenance.status = "failed";
        process.exitCode = 1;
      }
    }
  } catch (error) {
    console.error(`Result download failed: ${error.message}`);
    provenance.status = "failed";
    provenance.downloadError = error.message;
    process.exitCode = 1;
  }
  finally {
    clearTimeout(deadline);
    try {
      const stopped = await sandbox.stop();
      provenance.activeCpuDurationMs = stopped.activeCpuDurationMs;
      console.log(`Stopped sandbox after ${((Date.now() - started) / 1000).toFixed(0)} s`);
    } catch (error) {
      provenance.status = "failed";
      provenance.stopError = error.message;
      process.exitCode = 1;
      console.error(`Sandbox stop failed: ${error.message}`);
    } finally {
      provenance.elapsedMs = Date.now() - started;
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(`${destination}.provenance.json`, JSON.stringify(provenance, null, 2) + "\n");
      console.log(`Local results: ${destination}.{json,md,provenance.json}`);
    }
  }
}
