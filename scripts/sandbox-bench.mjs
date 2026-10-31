// Benchmarks git HEAD only. Integrate and commit the suite/routes first.
// Run: node --env-file=.env.local scripts/sandbox-bench.mjs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { sectionsOption } from "../examples/demo/bench/config.mjs";
import { Sandbox } from "@vercel/sandbox";

const root = path.resolve(import.meta.dirname, "..");
const { values } = parseArgs({ options: { reverse: { type: "boolean", default: false }, sections: { type: "string" } } });
const sections = sectionsOption(values.sections);
const git = (...args) => execFileSync("git", args, { cwd: root, maxBuffer: 128 * 1024 * 1024 });
// Fail before provisioning if HEAD cannot run the suite. No local patches,
// ignored files, secrets or node_modules are uploaded.
git("cat-file", "-e", "HEAD:examples/demo/bench/run.mjs");
const commit = git("rev-parse", "HEAD").toString().trim();
const archive = git("archive", "--format=tar", "HEAD");
const archiveSha256 = createHash("sha256").update(archive).digest("hex");
const stamp = new Date().toISOString().replaceAll(":", "-");
const destination = path.join(root, "research/benchmarks", `sandbox-${stamp}`);
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
  image: "vercel/sandbox/node:24", vcpus: 4, memoryMiB: 8192, reverse: values.reverse, sections, nativeStart: "next start", status: "running", steps: [] };
console.log(`Sandbox ${sandbox.name}; HEAD ${commit}; archive SHA-256 ${archiveSha256}`);
console.log("Estimated total: 17–27 min including tools/install and both builds; 28 min abort budget, 30 min lifetime. Four vCPUs; app/load split 2+2 via taskset.");

async function step(label, estimate, script, sudo = false) {
  console.log(`\n${label}: estimated ${estimate}`);
  const start = Date.now();
  const result = await sandbox.runCommand({ cmd: "bash", args: ["-lc", `set -euo pipefail\n${script}`], sudo,
    stdout: process.stdout, stderr: process.stderr, signal: controller.signal });
  provenance.steps.push({ label, elapsedMs: Date.now() - start, exitCode: result.exitCode });
  if (result.exitCode !== 0) throw new Error(`${label}: exit ${result.exitCode}`);
}

try {
  await sandbox.writeFiles([{ path: "repo.tar", content: archive }], { signal: controller.signal });
  await step("Install compiler and CPU affinity tools", "1–2 min", `
    if ! command -v clang >/dev/null || ! command -v taskset >/dev/null; then
      if command -v dnf >/dev/null; then dnf install -y -q clang util-linux
      else apt-get update -qq && apt-get install -y -qq clang util-linux; fi
    fi
    node --version
    clang --version
    nproc
    cat /proc/meminfo | head -3`, true);
  await step("Install exact lockfile", "1–2 min", `
    mkdir next-scriptc
    tar -xf repo.tar -C next-scriptc
    cd next-scriptc
    test "$(sha256sum ../repo.tar | cut -d ' ' -f1)" = '${archiveSha256}'
    timeout 180s npx -y pnpm@11.1.3 install --frozen-lockfile --reporter=silent
    packages/next-scriptc/node_modules/.bin/scriptc --version`);
  // Sequential, with real exit status preserved. Never hide compiler failures
  // behind grep/"|| true" or build the two Next outputs concurrently.
  await step("Native production build", "2–5 min (10 min ceiling)", "cd next-scriptc && timeout 600s npx -y pnpm@11.1.3 --filter demo build");
  await step("Node production build", "15–60 s (3 min ceiling)", "cd next-scriptc && NEXT_SCRIPTC_BASELINE=node timeout 180s npx -y pnpm@11.1.3 --filter demo build");
  await step("Sandbox benchmark", "9–18 min (remaining overall budget)", `cd next-scriptc && BENCH_COMMIT='${commit}' BENCH_ARCHIVE_SHA256='${archiveSha256}' timeout --signal=TERM --kill-after=15s 1200s node examples/demo/bench/run.mjs --profile sandbox --sections=${sections.join(",")} --output /vercel/sandbox/bench-results${values.reverse ? " --reverse" : ""}`);
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
      const saved = await sandbox.downloadFile({ path: `/vercel/sandbox/bench-results.${extension}` }, { path: `${destination}.${extension}` }, { signal: AbortSignal.timeout(20_000) });
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
      const stopped = await sandbox.stop({ signal: AbortSignal.timeout(30_000) });
      provenance.activeCpuDurationMs = stopped.activeCpuDurationMs;
      console.log(`Stopped sandbox after ${((Date.now() - started) / 1000).toFixed(0)} s; active CPU ${stopped.activeCpuDurationMs == null ? "unavailable" : (stopped.activeCpuDurationMs / 1000).toFixed(1) + " s"}`);
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
