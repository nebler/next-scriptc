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
  fresh: { type: "boolean", default: false }, output: { type: "string" } } });
if (!values.node) throw new Error("--node https://<immutable-preview>.vercel.app is required; --native is optional");
if (!process.env.VERCEL_AUTOMATION_BYPASS_SECRET) throw new Error("Load VERCEL_AUTOMATION_BYPASS_SECRET from ignored .env.local");
const deployments = ["node", "native"].filter((variant) => values[variant]).map((variant) => {
  const url = new URL(values[variant]);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || !url.hostname.endsWith(".vercel.app")) {
    throw new Error("Use an immutable Vercel HTTPS deployment origin without credentials/path/query");
  }
  return { variant, url: url.origin };
});
if (new Set(deployments.map((deployment) => deployment.url)).size !== deployments.length) throw new Error("Variants must have distinct deployment URLs");
const stamp = new Date().toISOString().replaceAll(":", "-");
const destination = path.resolve(root, values.output ?? `research/benchmarks/vercel-${stamp}`);
const files = ["client.mjs", "worker.mjs"].map((name) => `examples/demo/bench/vercel/${name}`)
  .concat(["examples/demo/bench/config.mjs", "examples/demo/bench/load.mjs", "examples/demo/bench/fixtures.mjs"]);
const uploaded = await Promise.all(files.map(async (file) => ({ path: file, content: await readFile(path.join(root, file)) })));
const hash = createHash("sha256");
for (const file of uploaded) hash.update(file.path).update("\0").update(file.content);
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const data = { mode: deployments.length === 1 ? "baseline-only" : "Node/native comparison", status: "running", startedAt: new Date().toISOString(),
  sourceCommit: git("rev-parse", "HEAD"), dirty: Boolean(git("status", "--porcelain")), clientSha256: hash.digest("hex"), deployments };
await mkdir(path.dirname(destination), { recursive: true });
const started = Date.now();
let sandbox;
try {
  sandbox = await Sandbox.create({ image: "vercel/sandbox/node:24", region: "iad1", resources: { vcpus: 2 }, timeout: 240_000, persistent: false });
  data.sandbox = { id: sandbox.name, region: sandbox.region, vcpus: sandbox.vcpus };
  if (sandbox.region !== "iad1" || sandbox.vcpus !== 2) throw new Error("Sandbox region/resources differ from registration");
  console.log(`Sandbox ${sandbox.name}: ${sandbox.region}, ${sandbox.vcpus} vCPUs; 4-minute lifetime, 3-minute command ceiling`);
  await sandbox.writeFiles([...uploaded, { path: "job.json", content: Buffer.from(JSON.stringify({ deployments, fresh: values.fresh })) }]);
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
