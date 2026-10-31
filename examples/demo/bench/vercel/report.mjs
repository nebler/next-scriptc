import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const number = (n) => typeof n === "number" ? n.toFixed(3) : "unavailable";
export function report(data) {
  const lines = ["# Vercel route benchmark", "", `${data.mode}; status: **${data.status}**. ${data.startedAt}.`, "",
    `Client: ${data.environment?.node ?? "unavailable"}, ${data.environment?.platform ?? "unavailable"}/${data.environment?.arch ?? "unavailable"}; Sandbox ${data.sandbox?.id ?? "unavailable"} in ${data.sandbox?.region ?? "unavailable"}, ${data.sandbox?.vcpus ?? "unavailable"} vCPUs.`, "",
    `Source commit: ${data.sourceCommit}. Uploaded client files: SHA-256 ${data.clientSha256}. Working tree dirty at upload: ${data.dirty}.`, "",
    "HTTPS HTTP/1.1 closed loop, no pipelining/retries. Fixed registry fixtures; gzip parity uses decoded bytes. Dispatch-to-drained-body latency excludes decoding/digest checks; throughput includes their client cost. C=1: 20 warmup + 200 measured. C=16: 32 warmup + 3 s, at most 2,000 measured, on the warmed pool. Quantiles use nearest rank; 200 samples offer weak p99 evidence. No open-loop capacity or external-user latency claim.", "",
    "First rows are route-first responses before warmup, including DNS/TCP/TLS. Only hello is deployment-first; shared functions can already be warm for other routes. Freshness is operator-declared. Confirmed process-cold time, server duration and used memory are unavailable unless independently supplied by platform observability. x-vercel-id identifies request/regions, not cold state. No assumed idle eviction timeout.", ""];
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
    "Used memory / ratio: **unavailable / unavailable**. Function memory limits are not RSS. Use deployment-filtered Runtime Logs → Function metadata / Observability for memory, duration and start type; do not infer these from response latency. The public runtime-log schema and CLI may not export those fields on this plan. See README for collection commands.", "",
    "Deployment provenance / resource settings are supplied in the sibling metadata JSON when available; equality must be checked before interpreting native/Node differences. Baseline-only evidence cannot establish a native speedup. All losses, failures, count caps and omissions remain visible.", "");
  if (data.failureDetails) lines.push(`Worker failure: ${data.failureDetails.workerError}. ${data.failureDetails.cause}. Issued requests are unknown; conservative bound ${data.requestsIssuedUpperBound}. Other worker measurements were not recovered and are not reused.`, "");
  if (data.error) lines.push(`Runner error: ${data.error}`, "");
  return lines.join("\n");
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const file = process.argv[2];
  if (!file?.endsWith(".json")) throw new Error("Usage: node report.mjs research/benchmarks/vercel-<stamp>.json");
  await writeFile(file.replace(/\.json$/, ".md"), report(JSON.parse(await readFile(file))));
}
