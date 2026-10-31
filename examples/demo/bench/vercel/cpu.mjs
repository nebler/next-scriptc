import https from "node:https";
import { createClient, workloads } from "./client.mjs";

export const cpuProtocol = { label: "process CPU per request, self-reported", warmup: 20,
  requestsPerWindow: 100, acceptedWindows: 3, maxAttempts: 5, concurrency: 1, maxSockets: 1 };
const diagnostic = { path: "/api/diagnostics/memory", diagnostic: true };

export function cpuDelta(before, after, requests) {
  if (typeof before.instance !== "string" || typeof after.instance !== "string") throw new Error("Missing diagnostic instance token");
  if (before.instance !== after.instance) return { status: "discarded", reason: "instance-token-changed" };
  if (before.pid !== after.pid) throw new Error("PID changed without instance token changing");
  const delta = {};
  for (const field of ["user", "system"]) {
    if (![before.cpu?.[field], after.cpu?.[field]].every((value) => Number.isFinite(value) && value >= 0)
      || after.cpu[field] < before.cpu[field]) throw new Error(`Invalid/nonmonotonic CPU counter: ${field}`);
    delta[field] = after.cpu[field] - before.cpu[field];
  }
  return { status: "accepted", userMs: delta.user / 1000, systemMs: delta.system / 1000,
    cpuMs: (delta.user + delta.system) / 1000, cpuMsPerRequest: (delta.user + delta.system) / 1000 / requests };
}

export async function measureCpu(deployments, { secret, references, onRow = () => {} }) {
  const client = createClient(secret, 6372);
  const results = [];
  for (const deployment of deployments) {
    const result = { ...deployment, rows: [] };
    results.push(result);
    for (const spec of workloads) {
      const row = { workload: spec.id, path: spec.path, attempts: [], status: "running" };
      result.rows.push(row);
      const reference = references?.[spec.id];
      const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
      let connectionsCreated = 0;
      const create = agent.createConnection.bind(agent);
      agent.createConnection = (...args) => { connectionsCreated++; return create(...args); };
      const one = async () => {
        const response = await client.request(deployment.url, spec, agent);
        if (response.digest !== reference) throw new Error(`Response changed: ${spec.id}`);
        return response;
      };
      try {
        if (!reference) throw new Error(`Missing paired full-run reference: ${spec.id}`);
        row.reference = await one();
        for (let i = 0; i < cpuProtocol.warmup; i++) await one();
        for (let i = 0; i < cpuProtocol.maxAttempts && row.attempts.filter((a) => a.status === "accepted").length < cpuProtocol.acceptedWindows; i++) {
          const attempt = { attempt: i + 1, status: "running", requests: 0, reusedRequests: 0, startedAt: new Date().toISOString() };
          row.attempts.push(attempt);
          attempt.before = await client.request(deployment.url, diagnostic, agent);
          const start = performance.now();
          for (let j = 0; j < cpuProtocol.requestsPerWindow; j++) {
            const response = await one();
            attempt.requests++;
            attempt.reusedRequests += Number(response.reusedSocket);
          }
          attempt.elapsedMs = performance.now() - start;
          attempt.after = await client.request(deployment.url, diagnostic, agent);
          Object.assign(attempt, cpuDelta(attempt.before.body, attempt.after.body, attempt.requests));
        }
        row.status = row.attempts.filter((a) => a.status === "accepted").length === cpuProtocol.acceptedWindows ? "complete" : "unavailable";
        if (row.status === "unavailable") row.reason = "instance-token retry limit exhausted";
      } catch (error) {
        row.status = "failed"; row.error = error.message;
        const running = row.attempts.find((a) => a.status === "running");
        if (running) Object.assign(running, { status: "failed", error: error.message });
        // Failure is not retryable; retain partial data and stop this experiment.
        return { mode: "cpu", protocol: cpuProtocol, deployments: results, requestsIssued: client.issued, status: "failed" };
      } finally { agent.destroy(); row.connectionsCreated = connectionsCreated; onRow(deployment.variant, row); }
    }
  }
  return { mode: "cpu", protocol: cpuProtocol, deployments: results, requestsIssued: client.issued,
    status: results.every((d) => d.rows.every((r) => r.status === "complete")) ? "complete" : "incomplete" };
}
