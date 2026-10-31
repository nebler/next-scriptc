// Run from the repo root with node --env-file=.env.local.
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import { report } from "./report.mjs";

const root = path.resolve(import.meta.dirname, "../../../..");
const { values } = parseArgs({ options: { node: { type: "string" }, native: { type: "string" },
  mode: { type: "string", default: "full" }, "native-first": { type: "boolean", default: false },
  reference: { type: "string" }, fresh: { type: "boolean", default: false }, output: { type: "string" } } });
if (!values.node && !values.native) throw new Error("--node and/or --native immutable preview origins are required");
if (!process.env.VERCEL_AUTOMATION_BYPASS_SECRET) throw new Error("Load VERCEL_AUTOMATION_BYPASS_SECRET from ignored .env.local");
if (!["full", "cold", "tail", "idle", "cpu"].includes(values.mode)) throw new Error("--mode must be full, cold, tail, idle or cpu");
const deployments = (values["native-first"] ? ["native", "node"] : ["node", "native"]).filter((variant) => values[variant]).map((variant) => {
  const url = new URL(values[variant]);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || !url.hostname.endsWith(".vercel.app")) {
    throw new Error("Use an immutable Vercel HTTPS deployment origin without credentials/path/query");
  }
  return { variant, url: url.origin };
});
if (new Set(deployments.map((deployment) => deployment.url)).size !== deployments.length) throw new Error("Variants must have distinct deployment URLs");
// Control-plane inspection does not invoke/warm application routes.
for (const deployment of deployments) {
  const info = JSON.parse(execFileSync("vercel", ["inspect", deployment.url, "--json"], { cwd: root, encoding: "utf8" }));
  if (info.name !== "next-scriptc" || info.target === "production" || info.readyState !== "READY") throw new Error("Use a READY preview of next-scriptc");
  deployment.server = { id: info.id, target: info.target, createdAt: info.createdAt,
    functions: info.builds.flatMap((build) => build.output ?? []).filter((output) => output.lambda).map((output) => ({
      path: output.path, functionName: output.lambda.functionName, runtime: output.lambda.runtime,
      regions: output.lambda.deployedTo, allocatedMemoryMiB: output.lambda.memorySize, timeoutSeconds: output.lambda.timeout,
    })) };
  const helloFunction = deployment.server.functions.find((fn) => fn.path === "api/hello");
  const memoryFunction = deployment.server.functions.find((fn) => fn.path === "api/diagnostics/memory");
  if (!helloFunction || !memoryFunction || helloFunction.functionName !== memoryFunction.functionName) throw new Error("Memory diagnostic must share the measured hello Function");
  for (const route of ["api/verify", "api/analytics/revenue", "api/export.json.gz", "api/stores/nearby", "api/posts/[slug]"]) {
    const fn = deployment.server.functions.find((entry) => entry.path === route);
    if (!fn || fn.functionName !== helloFunction.functionName) throw new Error(`Workload must share diagnostic Function: ${route}`);
  }
  if (helloFunction.runtime !== (deployment.variant === "node" ? "nodejs24.x" : "executable")
    || deployment.server.functions.some((fn) => fn.allocatedMemoryMiB !== 2048 || fn.timeoutSeconds !== 300)) throw new Error("Runtime/resources differ from registration");
  if (deployment.server.functions.some((fn) => fn.regions?.length !== 1 || fn.regions[0] !== "iad1")) throw new Error("Every function must be pinned to iad1");
}
let references;
if (values.mode === "cpu") {
  if (!values.reference || values.fresh) throw new Error("CPU requires --reference full-pair.json and already-measured deployments");
  const full = JSON.parse(await readFile(values.reference));
  if (full.status !== "complete") throw new Error("CPU reference must be a complete paired full run");
  for (const d of deployments) if (!full.deployments.some((r) => r.variant === d.variant && r.url === d.url)) throw new Error("CPU deployment differs from full reference");
  const node = full.deployments.find((d) => d.variant === "node");
  const native = full.deployments.find((d) => d.variant === "native");
  references = Object.fromEntries(node.rows.map((r) => {
    const other = native.rows.find((n) => n.workload === r.workload);
    if (r.status !== "measured" || other?.status !== "measured" || r.first.digest !== other.first.digest) throw new Error("Unvalidated CPU reference");
    return [r.workload, r.first.digest];
  }));
}
const project = JSON.parse(await readFile(path.join(root, ".vercel/project.json")));
const remote = JSON.parse(execFileSync("vercel", ["api", `/v9/projects/${project.projectId}`], { cwd: root, encoding: "utf8" }));
const platform = { observedAt: new Date().toISOString(), projectResourceConfig: remote.resourceConfig };
const stamp = new Date().toISOString().replaceAll(":", "-");
const destination = path.resolve(root, values.output ?? `research/benchmarks/vercel-${stamp}`);
const files = ["client.mjs", "worker.mjs", "diagnostics.mjs", "cpu.mjs"].map((name) => `examples/demo/bench/vercel/${name}`)
  .concat(["examples/demo/bench/config.mjs", "examples/demo/bench/load.mjs", "examples/demo/bench/fixtures.mjs"]);
const uploaded = await Promise.all(files.map(async (file) => ({ path: file, content: await readFile(path.join(root, file)) })));
const hash = createHash("sha256");
for (const file of uploaded) hash.update(file.path).update("\0").update(file.content);
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const data = { mode: deployments.length === 1 ? "baseline-only" : "Node/native comparison", status: "running", platform, startedAt: new Date().toISOString(),
  sourceCommit: git("rev-parse", "HEAD"), dirty: Boolean(git("status", "--porcelain")), clientSha256: hash.digest("hex"), deployments };
await mkdir(path.dirname(destination), { recursive: true });
const started = Date.now();
let sandbox;
try {
  sandbox = await Sandbox.create({ image: "vercel/sandbox/node:24", region: "iad1", resources: { vcpus: 2 }, timeout: 240_000, persistent: false });
  data.sandbox = { id: sandbox.name, region: sandbox.region, vcpus: sandbox.vcpus };
  if (sandbox.region !== "iad1" || sandbox.vcpus !== 2) throw new Error("Sandbox region/resources differ from registration");
  console.log(`Sandbox ${sandbox.name}: ${sandbox.region}, ${sandbox.vcpus} vCPUs; 4-minute lifetime, 3-minute command ceiling`);
  await sandbox.writeFiles([...uploaded, { path: "job.json", content: Buffer.from(JSON.stringify({ deployments, fresh: values.fresh, mode: values.mode, references })) }]);
  const result = await sandbox.runCommand({ cmd: "timeout", args: ["--signal=TERM", "--kill-after=5s", "180s", "node", "examples/demo/bench/vercel/worker.mjs"],
    env: { VERCEL_AUTOMATION_BYPASS_SECRET: process.env.VERCEL_AUTOMATION_BYPASS_SECRET },
    stdout: process.stdout, stderr: process.stderr, signal: AbortSignal.timeout(190_000) });
  const saved = await sandbox.downloadFile({ path: "result.json" }, { path: `${destination}.partial.json` });
  if (!saved) throw new Error(`No worker results; exit ${result.exitCode}`);
  Object.assign(data, JSON.parse(await readFile(`${destination}.partial.json`)));
  await rm(`${destination}.partial.json`);
  if (result.exitCode !== 0) throw new Error(`Benchmark worker exit ${result.exitCode}`);
} catch (error) {
  data.status = "failed";
  data.error = error.message;
  process.exitCode = 1;
  console.error(error.message);
} finally {
  if (sandbox) {
    try { const stopped = await sandbox.stop({ signal: AbortSignal.timeout(20_000) }); data.sandbox.activeCpuDurationMs = stopped.activeCpuDurationMs ?? null; }
    catch (error) { data.status = "failed"; data.stopError = error.message; process.exitCode = 1; }
    data.sandbox.provisionedVcpuHours = (Date.now() - started) * 2 / 3_600_000;
  }
  data.elapsedMs = Date.now() - started;
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(`${destination}.json`, JSON.stringify(data, null, 2) + "\n");
  await writeFile(`${destination}.md`, report(data));
  console.log(`Results: ${destination}.{json,md}; requests: ${data.requestsIssued ?? "unknown"}; provisioned vCPU-h upper bound: ${data.sandbox?.provisionedVcpuHours ?? "unknown"}`);
}
