// Execute exactly the pre-registered five pairs. No retries or result selection.
// Resume is intentionally absent: inspect saved evidence after any failure.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = path.resolve(import.meta.dirname, "../../../../..");
process.chdir(root);
const prefix = "research/benchmarks/vercel-final";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
// One-off recovery from the recorded upload failure; never repeats a measured pair.
const provenance = JSON.parse(readFileSync(`${prefix}-provenance.json`));
const cost = JSON.parse(readFileSync(`${prefix}-cost.json`));
const linux = JSON.parse(readFileSync(`${prefix}-linux-current.json`));
const pair1 = JSON.parse(readFileSync(`${prefix}-pair-1.json`));
if (provenance.status !== "failed" || provenance.deployments.length !== 2 || cost.previews !== 2
  || pair1.status !== "complete" || existsSync(`${prefix}-pair-2.json`)
  || git("rev-parse", "HEAD") !== provenance.sourceCommit) throw new Error("Unexpected recovery state");
provenance.recovery = { artifact: `${prefix}-control-failure.json`, reason: "unmeasured pair-2 upload failed; no new deployment found", startedAt: new Date().toISOString() };
provenance.status = "running"; cost.status = "running";
function save() {
  cost.httpAttempts = cost.validationLocalHttpAttempts + cost.hostedHttpAttempts;
  cost.provisionedVcpuHours = cost.sandboxes.reduce((n, s) => n + s.provisionedVcpuHours, 0);
  cost.activeCpuDurationMs = cost.sandboxes.reduce((n, s) => n + (s.activeCpuDurationMs ?? 0), 0);
  writeFileSync(`${prefix}-provenance.json`, JSON.stringify(provenance, null, 2) + "\n");
  writeFileSync(`${prefix}-cost.json`, JSON.stringify(cost, null, 2) + "\n");
}
function reserve(requests, hours) {
  save();
  if (cost.httpAttempts + requests > 40000 || cost.provisionedVcpuHours + hours > 0.3) throw new Error("Cannot reserve remaining run within budget");
  if (git("rev-parse", "HEAD") !== provenance.sourceCommit || git("diff", "HEAD", "--", "examples/demo/app", "packages/next-scriptc", "pnpm-lock.yaml")) throw new Error("Source drift");
}
function run(mode, pair, output, requests, extra = []) {
  reserve(requests, 0.134);
  const args = ["--env-file=.env.local", "examples/demo/bench/vercel/run.mjs", "--node", pair.node, "--native", pair.native,
    "--mode", mode, "--output", output, ...extra];
  try { execFileSync(process.execPath, args, { stdio: "inherit", env: process.env }); }
  finally {
    if (existsSync(`${output}.json`)) {
      const data = JSON.parse(readFileSync(`${output}.json`));
      cost.hostedHttpAttempts += data.requestsIssued ?? requests;
      if (data.sandbox) cost.sandboxes.push({ artifact: `${output}.json`, ...data.sandbox });
      save();
    } else { cost.hostedHttpAttempts += requests; cost.sandboxes.push({ artifact: output, provisionedVcpuHours: 0.134, status: "unknown; charged full reservation" }); save(); }
  }
  const data = JSON.parse(readFileSync(`${output}.json`));
  if (data.status !== "complete") throw new Error(`Failed ${mode} run; stop and inspect ${output}.json`);
}
try {
  for (let i = 2; i <= 5; i++) {
    const order = i % 2 ? ["node", "native"] : ["native", "node"];
    const pair = {};
    for (const variant of order) {
      reserve(0, 0);
      if (cost.previews >= 12) throw new Error("Preview budget exhausted");
      const env = { ...process.env, SCRIPTC_CHECKER_SERVER: "0" };
      delete env.NEXT_SCRIPTC_BASELINE; delete env.NEXT_SCRIPTC_DEMO_GROUPS;
      if (variant === "node") env.NEXT_SCRIPTC_BASELINE = "node";
      else env.NEXT_SCRIPTC_DEMO_GROUPS = "vercel";
      console.log(`PAIR ${i}: building/deploying ${variant}`);
      try { execFileSync(process.execPath, ["examples/demo/bench/vercel/deploy.mjs"], { stdio: "inherit", env }); }
      catch (error) {
        const acceptedFile = `.vercel/${variant}-accepted.json`;
        if (existsSync(acceptedFile)) {
          const accepted = JSON.parse(readFileSync(acceptedFile));
          if (accepted.sourceCommit === provenance.sourceCommit && !provenance.deployments.some((d) => d.id === accepted.id)) {
            cost.previews++; provenance.deployments.push({ pair: i, variant, ...accepted, status: "inspection failed; not measured" }); save();
          }
        }
        throw error;
      }
      const file = `${prefix}-pair-${i}-${variant}-deployment.json`;
      const raw = readFileSync(`.vercel/${variant}-deployment.json`);
      writeFileSync(file, raw);
      const info = JSON.parse(raw);
      if (info.sourceCommit !== provenance.sourceCommit) throw new Error("Deployment source mismatch");
      pair[variant] = `https://${info.deployed.url}`;
      cost.previews++;
      provenance.deploymentOrder.push(variant);
      provenance.deployments.push({ pair: i, variant, id: info.deployed.id, url: pair[variant], artifact: file });
      save(); // Save identity before more operations/builds can fail.
      const sizes = execFileSync("python3", ["examples/demo/bench/vercel/function-sizes.py", `pair-${i}-${variant}`, ".vercel/output", root, file]);
      writeFileSync(`${prefix}-pair-${i}-${variant}-sizes.json`, sizes);
      if (variant === "native") {
        const artifact = readFileSync(".vercel/output/functions/api/analytics/revenue.func/executable");
        if (createHash("sha256").update(artifact).digest("hex") !== linux.artifactSha256) throw new Error("Native binary differs from Linux CPU/RSS validation; stop before application traffic");
      }
    }
    provenance.measurementOrder.push(order);
    run(i === 5 ? "full" : "cold", pair, `${prefix}-pair-${i}`, i === 5 ? 25456 : 128,
      ["--fresh", ...(i % 2 ? [] : ["--native-first"])]);
    if (i === 5) run("cpu", pair, `${prefix}-cpu`, 6372, ["--reference", `${prefix}-pair-5.json`]);
  }
  provenance.status = "measurements-complete";
  cost.status = "measurements-complete; verification and cleanup pending";
} catch (error) { provenance.status = "failed"; provenance.error = error.message; cost.status = "stopped"; throw error; }
finally { save(); }
