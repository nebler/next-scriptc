// Standalone I/O mode; never invokes the CPU-only historical workload registry.
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import path from "node:path";
import { Sandbox } from "@vercel/sandbox";

const root = path.resolve(import.meta.dirname, "../../../..");
const { values } = parseArgs({ options: { node: { type: "string" }, native: { type: "string" }, mode: { type: "string", default: "full" },
  fresh: { type: "boolean", default: false }, "native-first": { type: "boolean", default: false }, output: { type: "string" } } });
if (!["full", "cold"].includes(values.mode) || !values.node || !values.native) throw new Error("Provide --node URL --native URL --mode full|cold");
if (!process.env.VERCEL_AUTOMATION_BYPASS_SECRET) throw new Error("Load ignored .env.local bypass credential");
if (!(process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL) || !(process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)) throw new Error("Hosted Redis is not connected; stop at local results");
if (process.env.IO_ALLOW_RESET !== "1") throw new Error("Set IO_ALLOW_RESET=1 to reset the isolated benchmark namespace");
const destination = path.resolve(root, values.output ?? `research/benchmarks/realistic-io-${Date.now()}`);
if (existsSync(`${destination}.json`)) throw new Error("Output already exists: retain it and choose a new experiment name");
const deployments = (values["native-first"] ? ["native", "node"] : ["node", "native"]).map((variant) => {
  const url = new URL(values[variant]);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || !url.hostname.endsWith(".vercel.app")) throw new Error("Use immutable Vercel HTTPS preview origins");
  return { variant, url: url.origin };
});
if (deployments[0].url === deployments[1].url) throw new Error("Distinct previews required");
for (const deployment of deployments) {
  const info = JSON.parse(execFileSync("vercel", ["inspect", deployment.url, "--json"], { cwd: root, encoding: "utf8" }));
  if (info.name !== "next-scriptc" || info.target === "production" || info.readyState !== "READY") throw new Error("Expected READY next-scriptc preview");
  const functions = info.builds.flatMap((b) => b.output ?? []).filter((o) => o.lambda).map((o) => ({ path: o.path, ...o.lambda }));
  if (new Set(functions.map((f) => f.functionName)).size > 12) throw new Error("Hobby Function limit exceeded");
  const main = functions.find((f) => f.path === "api/app/orders");
  for (const route of ["api/app/webhooks/payment", "api/app/diagnostics/redis", "api/app/diagnostics/process", "api/diagnostics/memory"]) {
    const fn = functions.find((f) => f.path === route);
    if (!main || fn?.functionName !== main.functionName) throw new Error(`Route/diagnostic not shared: ${route}`);
  }
  if (main.runtime !== (deployment.variant === "native" ? "executable" : "nodejs24.x")
    || functions.some((f) => f.memorySize !== 2048 || f.timeout !== 300 || f.deployedTo?.length !== 1 || f.deployedTo[0] !== "iad1")) throw new Error("Resources differ from registration");
  deployment.server = { id: info.id, createdAt: info.createdAt, functions: functions.map(({ path, functionName, runtime, memorySize, timeout, deployedTo }) => ({ path, functionName, runtime, memorySize, timeout, deployedTo })) };
}
const files = ["examples/demo/bench/vercel/io-client.mjs", "examples/demo/bench/vercel/io-worker.mjs", "examples/demo/bench/vercel/cpu.mjs",
  "examples/demo/bench/vercel/client.mjs", "examples/demo/bench/io/fixtures.mjs", "examples/demo/bench/io/seed.mjs",
  "examples/demo/bench/config.mjs", "examples/demo/bench/load.mjs", "examples/demo/bench/fixtures.mjs"];
const uploaded = await Promise.all(files.map(async (file) => ({ path: file, content: await readFile(path.join(root, file)) })));
const hash = createHash("sha256"); for (const file of uploaded) hash.update(file.path).update("\0").update(file.content);
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const data = { startedAt: new Date().toISOString(), status: "running", sourceCommit: git("rev-parse", "HEAD"), dirty: Boolean(git("status", "--porcelain")),
  clientSha256: hash.digest("hex"), deployments };
const maxSeconds = values.mode === "cold" ? 60 : 240;
const reservedRequests = values.mode === "cold" ? 104 : 7420;
// Persistent ledger reserves pessimistic costs BEFORE provisioning. Missing
// worker files or a crashed controller cannot erase a run's budget consumption.
const ledgerFile = path.join(root, "research/benchmarks/realistic-io-cost.json");
const ledger = existsSync(ledgerFile) ? JSON.parse(await readFile(ledgerFile)) : { previews: 0, runs: [], sandboxVcpuHoursReserved: 0, invocationsReserved: 0, redisCommandsReserved: 0 };
if (ledger.invocationsReserved + reservedRequests > 40000 || ledger.sandboxVcpuHoursReserved + maxSeconds * 2 / 3600 > .3
  || ledger.redisCommandsReserved + reservedRequests * 4 + 1000 >= 125000) throw new Error("Task budget exhausted");
ledger.invocationsReserved += reservedRequests; ledger.redisCommandsReserved += reservedRequests * 4 + 1000;
ledger.sandboxVcpuHoursReserved += maxSeconds * 2 / 3600;
const charge = { output: path.relative(root, destination), requestsReserved: reservedRequests, sandboxVcpuHoursReserved: maxSeconds * 2 / 3600, status: "reserved" };
ledger.runs.push(charge);
await mkdir(path.dirname(destination), { recursive: true }); await writeFile(ledgerFile, JSON.stringify(ledger, null, 2) + "\n");
let sandbox;
try {
  sandbox = await Sandbox.create({ image: "vercel/sandbox/node:24", region: "iad1", resources: { vcpus: 2 }, timeout: maxSeconds * 1000, persistent: false });
  data.sandbox = { id: sandbox.name, region: sandbox.region, vcpus: sandbox.vcpus };
  if (sandbox.region !== "iad1" || sandbox.vcpus !== 2) throw new Error("Sandbox resources differ");
  await sandbox.writeFiles([...uploaded, { path: "job.json", content: Buffer.from(JSON.stringify({ deployments, mode: values.mode, fresh: values.fresh, budget: reservedRequests / 2 })) }]);
  const result = await sandbox.runCommand({ cmd: "timeout", args: ["--signal=TERM", "--kill-after=5s", `${maxSeconds - 15}s`, "node", "examples/demo/bench/vercel/io-worker.mjs"],
    env: { VERCEL_AUTOMATION_BYPASS_SECRET: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL,
      UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN, DEMO_REDIS_PREFIX: process.env.DEMO_REDIS_PREFIX ?? "next-scriptc:io" },
    signal: AbortSignal.timeout((maxSeconds - 5) * 1000), stdout: process.stdout, stderr: process.stderr });
  const downloaded = await sandbox.downloadFile({ path: "result.json" }, { path: `${destination}.worker.json` });
  if (!downloaded) throw new Error("Missing worker results; reserved budget retained");
  Object.assign(data, JSON.parse(await readFile(`${destination}.worker.json`)));
  if (result.exitCode !== 0) throw new Error(`I/O worker exit ${result.exitCode}`);
} catch (error) { data.status = "failed"; data.error = error.message; process.exitCode = 1; }
finally {
  if (sandbox) {
    try { const stopped = await sandbox.stop({ signal: AbortSignal.timeout(15000) }); data.sandbox.activeCpuDurationMs = stopped.activeCpuDurationMs ?? null; }
    catch (error) { data.status = "failed"; data.stopError = error.message; process.exitCode = 1; }
  }
  data.finishedAt = new Date().toISOString(); charge.status = data.status; charge.requestsObserved = data.requestsIssued ?? null; charge.sandbox = data.sandbox;
  await writeFile(`${destination}.json`, JSON.stringify(data, null, 2) + "\n"); await writeFile(ledgerFile, JSON.stringify(ledger, null, 2) + "\n");
  console.log(`Saved ${destination}.json; ${data.status}`);
}
