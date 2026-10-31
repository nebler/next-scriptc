import https from "node:https";
import { createClient, workloads } from "./client.mjs";

// Deliberately separate experiments; never splice their rows into the full run.
export async function diagnose(deployments, { mode, fresh, secret }) {
  if (mode === "cold" && !fresh) throw new Error("Cold-only mode requires --fresh and untouched deployments");
  const client = createClient(secret, mode === "tail" ? 13_700 : 200);
  const results = [], expected = new Map();
  for (const deployment of deployments) {
    const row = { ...deployment, startedAt: new Date().toISOString(), firstRequestDefinition: fresh ? "operator-declared untouched fresh deployment" : "previously requested; cold state unknown" };
    results.push(row);
    const hello = workloads[0];
    const one = async (spec) => {
      const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
      try {
        const response = await client.request(deployment.url, spec, agent);
        if (expected.has(spec.id) && expected.get(spec.id) !== response.digest) throw Object.assign(new Error(`Cross-variant digest mismatch: ${spec.id}`), { correctness: true });
        expected.set(spec.id, response.digest);
        return response;
      } finally { agent.destroy(); }
    };
    try {
      if (mode === "cold" || mode === "idle") {
        row.first = await one(hello);
        row.memoryAfterFirst = await client.memory(deployment.url);
        if (mode === "cold") {
          row.routeFirst = [];
          for (const spec of workloads.slice(1, 3)) row.routeFirst.push({ workload: spec.id, ...await one(spec) });
        }
        row.warm = await client.window(deployment.url, hello, 1, 20, { count: 40 }, row.first.digest);
        if (row.warm.error) throw Object.assign(new Error(row.warm.error), { correctness: row.warm.correctness });
        row.firstMinusWarmP50Ms = row.first.ms - row.warm.p50Ms;
      } else if (mode === "tail") {
        // Change both variant and first concurrent workload order explicitly.
        const verify = workloads[1];
        const verifyWindow = async () => {
          const first = await one(verify);
          return client.window(deployment.url, verify, 16, 32, { count: 32 }, first.digest, true);
        };
        if (deployment.variant === "node") row.verifyBefore = await verifyWindow();
        row.first = await one(hello);
        row.memoryBefore = await client.memory(deployment.url);
        row.original = await client.window(deployment.url, hello, 16, 32,
          { count: 700, durationMs: 3000 }, row.first.digest, true);
        if (row.original.error) throw new Error(row.original.error);
        row.longWarmup = await client.window(deployment.url, hello, 16,
          { count: 1500, durationMs: 3000 }, { count: 4500, durationMs: 10_000 }, row.first.digest, true);
        if (row.longWarmup.error) throw new Error(row.longWarmup.error);
        row.memoryAfterLoad = await client.memory(deployment.url);
        if (deployment.variant === "native") row.verifyAfter = await verifyWindow();
      } else throw new Error(`Unknown diagnostic mode: ${mode}`);
      row.status = "complete";
    } catch (error) {
      row.status = "failed"; row.error = error.message;
      if (error.correctness) return { mode, deployments: results, requestsIssued: client.issued, status: "failed", stoppedOnCorrectnessFailure: true };
    }
    row.finishedAt = new Date().toISOString();
    console.log(`${deployment.variant} ${mode}: ${row.status}`);
  }
  return { mode, deployments: results, requestsIssued: client.issued,
    status: results.some((row) => row.status !== "complete") ? "failed" : "complete" };
}
