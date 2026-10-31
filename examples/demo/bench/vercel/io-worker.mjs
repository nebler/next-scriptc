import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { measureIo } from "./io-client.mjs";
import { seed } from "../io/seed.mjs";
const job = JSON.parse(await readFile("job.json"));
const results = [];
for (const deployment of job.deployments) {
  const result = await measureIo(deployment, { mode: job.mode, fresh: job.fresh, secret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    reset: () => seed(), budget: job.budget });
  results.push(result);
  await writeFile("result.json", JSON.stringify({ status: results.every((r) => r.status === "complete") ? "complete" : "failed", deployments: results,
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model },
    requestsIssued: results.reduce((sum, r) => sum + r.requestsIssued, 0) }, null, 2) + "\n");
  if (result.status === "failed") break;
}
if (results.some((r) => r.status !== "complete")) process.exitCode = 1;
