import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { measure } from "./client.mjs";

const job = JSON.parse(await readFile("job.json"));
const data = { environment: { node: process.version, platform: process.platform, arch: process.arch,
  cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model, loadavg: os.loadavg() } };
try {
  Object.assign(data, await measure(job.deployments, { fresh: job.fresh, secret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    onRow: (variant, row) => console.log(`${variant} ${row.workload}: ${row.status}${row.error ? ": " + row.error : ""}`) }));
} catch (error) { data.status = "failed"; data.error = error.message; }
await writeFile("result.json", JSON.stringify(data, null, 2) + "\n");
if (data.status !== "complete") process.exitCode = 1;
