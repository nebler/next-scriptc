import { readArtifact } from '../../../../research/lib/artifact.mjs';
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const number = (n) => typeof n === "number" ? n.toFixed(3) : "unavailable";
export function report(data) {
  if (data.mode === "cpu") return ["# Process CPU per request, self-reported", "", `Status: ${data.status}. Not Vercel billed Active CPU.`, "", "Raw boundaries, all accepted/discarded/failed attempts, request counts, connections and provenance are in the sibling JSON.", "", ...(data.deployments ?? []).flatMap((d) => (d.rows ?? []).map((r) => `${d.variant} ${r.workload}: ${r.status}; accepted ms/request: ${r.attempts.filter((a) => a.status === "accepted").map((a) => number(a.cpuMsPerRequest)).join(", ")}`)), ""].join("\n");
  if (["cold", "tail", "idle"].includes(data.mode)) return diagnosticReport(data);
  const lines = ["# Vercel route benchmark", "", `${data.mode}; status: **${data.status}**. ${data.startedAt}.`, "",
    `Client: ${data.environment?.node ?? "unavailable"}, ${data.environment?.platform ?? "unavailable"}/${data.environment?.arch ?? "unavailable"}; Sandbox ${data.sandbox?.id ?? "unavailable"} in ${data.sandbox?.region ?? "unavailable"}, ${data.sandbox?.vcpus ?? "unavailable"} vCPUs.`, "",
    `Source commit: ${data.sourceCommit}. Uploaded client files: SHA-256 ${data.clientSha256}. Working tree dirty at upload: ${data.dirty}.`, "",
    "HTTPS HTTP/1.1 closed loop, no pipelining/retries. Fixed registry fixtures; gzip parity uses decoded bytes. Dispatch-to-drained-body latency excludes decoding/digest checks; throughput includes their client cost. C=1: 20 warmup + 200 measured. Protocol revision 2. C=16: up to 2 s / 1,000 warmup + 3 s / 900 measured, on the warmed pool. Quantiles use nearest rank; 200 samples offer weak p99 evidence. No open-loop capacity or external-user latency claim.", "",
    "First rows are route-first responses before warmup, including DNS/TCP/TLS. Only hello is deployment-first; shared functions can already be warm for other routes. Freshness is operator-declared. Confirmed process-cold time, server duration and whole-instance used memory are unavailable unless independently supplied by platform observability; diagnostic process RSS is separate. x-vercel-id identifies request/regions, not cold state. No assumed idle eviction timeout.", ""];
  for (const deployment of data.deployments ?? []) lines.push(`- ${deployment.variant}: ${deployment.url}; ${deployment.firstRequestDefinition}.`);
  for (const deployment of data.deployments ?? []) {
    const fn = deployment.server?.functions.find((entry) => entry.path === "api/hello");
    lines.push(`  Server: ${deployment.server?.id ?? "unavailable"}; target=${deployment.server?.target ?? "preview/unspecified"}; hello runtime=${fn?.runtime ?? "unavailable"}, region=${fn?.regions?.join(",") ?? "unavailable"}, allocated memory=${fn?.allocatedMemoryMiB ?? "unavailable"} MiB (not used memory). Full function mappings are in JSON.`);
  }
  lines.push("", `Project Fluid setting observed at ${data.platform?.observedAt ?? "unavailable"}: ${data.platform?.projectResourceConfig?.fluid ?? "unavailable"}. This is a control-plane observation, not per-request start evidence.`, "");
  lines.push("", "Every metric cell is value; variant/Node ratio. Lower is better for latency, higher for req/s. Ratios require two validated variants; baseline-only is unavailable. Failed rows invalidate comparisons. Client CPU ≥0.8 cores flags suspected generator saturation; count-limited windows are not sustained capacity.", "",
    "| Workload | Variant | First ms; ratio ↓ | C=1 p50 ms; ratio ↓ | p95 ms; ratio ↓ | p99 ms; ratio ↓ | C=16 req/s; ratio ↑ | C=16 p50/p95/p99 ms; ratios ↓ | C=16 count / elapsed ms | CPU cores / saturated / capped | Status |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  const baseline = data.deployments?.find((deployment) => deployment.variant === "node");
  const native = data.deployments?.find((deployment) => deployment.variant === "native");
  for (const deployment of data.deployments ?? []) for (const row of deployment.rows ?? []) {
    const ref = baseline?.rows.find((candidate) => candidate.workload === row.workload);
    const other = native?.rows.find((candidate) => candidate.workload === row.workload);
    const valid = ref?.status === "measured" && other?.status === "measured" && row.status === "measured" && ref.first.digest === other.first.digest;
    const cell = (value, base) => `${number(value)}; ${valid && typeof value === "number" && base > 0 ? (value / base).toFixed(3) + "×" : "unavailable"}`;
    lines.push(`| ${row.workload} | ${deployment.variant} | ${cell(row.first?.ms, ref?.first?.ms)} | ${cell(row.sequential?.p50Ms, ref?.sequential?.p50Ms)} | ${cell(row.sequential?.p95Ms, ref?.sequential?.p95Ms)} | ${cell(row.sequential?.p99Ms, ref?.sequential?.p99Ms)} | ${cell(row.concurrent?.requestsPerSecond, ref?.concurrent?.requestsPerSecond)} | ${["p50Ms", "p95Ms", "p99Ms"].map((key) => cell(row.concurrent?.[key], ref?.concurrent?.[key])).join(" / ")} | ${row.concurrent?.requests ?? "unavailable"} / ${number(row.concurrent?.elapsedMs)} | ${number(row.concurrent?.generatorCpuCores)} / ${row.concurrent?.generatorSaturationSuspected ?? "unavailable"} / ${row.concurrent?.countLimited ?? "unavailable"} | ${row.status}${row.error ? ": " + row.error.replaceAll("|", "\\|") : ""} |`);
  }
  lines.push("", `Issued requests (includes warmup/first/failures): ${data.requestsIssued ?? "unavailable"}. Provisioned Sandbox upper bound: ${number(data.sandbox?.provisionedVcpuHours)} vCPU-h. Platform active CPU: ${number(data.sandbox?.activeCpuDurationMs)} ms (not the provisioned upper bound).`, "",
    "Shared-Function diagnostic process RSS is in JSON (memoryAfterFirst / memoryAfterLoad); each response may reach any instance. Native includes its sole executable process, with no Go proxy. Node includes in-process launcher work and excludes only separate platform processes. Whole-instance memory and platform peak remain unavailable. Function limits are not RSS.", "",
    "Deployment provenance / resource settings are supplied in the sibling metadata JSON when available; equality must be checked before interpreting native/Node differences. Baseline-only evidence cannot establish a native speedup. All losses, failures, count caps and omissions remain visible.", "");
  if (data.failureDetails) lines.push(`Worker failure: ${data.failureDetails.workerError}. ${data.failureDetails.cause}. Issued requests are unknown; conservative bound ${data.requestsIssuedUpperBound}. Other worker measurements were not recovered and are not reused.`, "");
  if (data.error) lines.push(`Runner error: ${data.error}`, "");
  return lines.join("\n");
}
function diagnosticReport(data) {
  const lines = [`# Vercel ${data.mode} diagnostic`, "", `Status: ${data.status}; ${data.startedAt}; source ${data.sourceCommit}; dirty=${data.dirty}.`, "",
    "All observations, deployment mappings, per-request tail timings and Sandbox provenance are retained in the sibling JSON. First-response latency includes DNS/TCP/TLS; confirmed process-cold state is unavailable. Diagnostic RSS is process-only and may reach any instance.", ""];
  for (const d of data.deployments ?? []) {
    lines.push(`- ${d.variant}: ${d.url}; ${d.status}; hello first ${number(d.first?.ms)} ms; warm p50 ${number(d.warm?.p50Ms)} ms; excess ${number(d.firstMinusWarmP50Ms)} ms.`);
    for (const key of ["original", "longWarmup"]) if (d[key]) lines.push(`  ${key}: ${d[key].requests} requests / ${number(d[key].elapsedMs)} ms; ${number(d[key].requestsPerSecond)} req/s; p50/p95/p99 ${number(d[key].p50Ms)}/${number(d[key].p95Ms)}/${number(d[key].p99Ms)} ms; capped=${d[key].countLimited}. Warmup ${d[key].warmup?.requests} / ${number(d[key].warmup?.elapsedMs)} ms.`);
    if (d.error) lines.push(`  Error: ${d.error}`);
  }
  lines.push("", `Issued requests: ${data.requestsIssued ?? "unknown"}; Sandbox provisioned upper bound ${number(data.sandbox?.provisionedVcpuHours)} vCPU-h.`, "");
  return lines.join("\n");
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const file = process.argv[2];
  if (!/\.json(?:\.gz)?$/.test(file ?? "")) throw new Error("Usage: node report.mjs research/benchmarks/vercel-<stamp>.json");
  await writeFile(file.replace(/\.json(?:\.gz)?$/, ".md"), report(JSON.parse(readArtifact(file))));
}
