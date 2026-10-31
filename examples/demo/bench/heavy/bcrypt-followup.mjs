// Last, previously unmeasured hosted native C1 row. CPU shares its three C1 samples.
import { readFile, writeFile, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
const prefix = "research/benchmarks/heavy-vercel-native-bcrypt";
try {
  await access(prefix + "-controller.json");
  throw new Error("Follow-up already started");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const primary = JSON.parse(
  await readFile("research/benchmarks/heavy-vercel.json"),
);
if (primary.rows.some((r) => r.variant === "native" && r.id === "bcrypt"))
  throw new Error("Native bcrypt was already measured");
const controls = await Promise.all(
  ["heavy-vercel-controller.json", "heavy-vercel-go-controller.json"].map(
    async (f) => JSON.parse(await readFile("research/benchmarks/" + f)),
  ),
);
if (controls[1].status !== "complete")
  throw new Error("Go completion must finish first");
const spent = controls.reduce((s, c) => s + c.sandbox.observedWallVcpuHours, 0);
if ((0.35 - spent) * 3600000 < 60000)
  throw new Error("Need a full minute of registered hosted budget");
const target = primary.targets.find((t) => t.variant === "native");
const expected = primary.correctness.find(
  (r) => r.id === "bcrypt" && r.size === 10,
).results[0].digest;
const inspect = JSON.parse(
  execFileSync("vercel", ["inspect", target.url, "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }),
);
if (inspect.id !== target.deploymentId || inspect.target === "production")
  throw new Error("Preview identity drift");
const started = Date.now();
const report = {
  status: "running",
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  startedAt: new Date().toISOString(),
  method:
    "Unmeasured native bcrypt C1 only; CPU uses same 3x1 requests; different 1-vCPU generator; no C16",
  priorHostedVcpuHours: spent,
};
let sandbox;
const save = () =>
  writeFile(
    prefix + "-controller.json",
    JSON.stringify(report, null, 2) + "\n",
  );
await save();
try {
  sandbox = await Sandbox.create({
    image: "vercel/sandbox/node:24",
    region: "iad1",
    resources: { vcpus: 1 },
    timeout: 56000,
    persistent: false,
  });
  report.sandbox = { id: sandbox.name, region: sandbox.region, vcpus: 1 };
  await save();
  const hash = createHash("sha256");
  const files = await Promise.all(
    ["client.mjs", "fixtures.mjs", "bcrypt-worker.mjs"].map(async (name) => {
      const content = await readFile("examples/demo/bench/heavy/" + name);
      hash.update(name).update(content);
      return { path: "examples/demo/bench/heavy/" + name, content };
    }),
  );
  report.clientSha256 = hash.digest("hex");
  await sandbox.writeFiles([
    ...files,
    {
      path: "bcrypt-job.json",
      content: Buffer.from(JSON.stringify({ target, expected })),
    },
  ]);
  const result = await sandbox.runCommand({
    cmd: "timeout",
    args: [
      "--signal=TERM",
      "--kill-after=1s",
      "51s",
      "node",
      "examples/demo/bench/heavy/bcrypt-worker.mjs",
    ],
    env: {
      VERCEL_AUTOMATION_BYPASS_SECRET:
        process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    },
    stdout: process.stdout,
    stderr: process.stderr,
    signal: AbortSignal.timeout(52000),
  });
  report.workerExit = result.exitCode;
  if (result.exitCode !== 0) throw new Error("Native bcrypt follow-up stopped");
  report.status = "complete";
} catch (e) {
  report.status = "failed";
  report.error = e.message;
  process.exitCode = 1;
} finally {
  if (sandbox) {
    try {
      const saved = await sandbox.downloadFile(
        { path: "bcrypt-result.json" },
        { path: prefix + ".json" },
        { signal: AbortSignal.timeout(2000) },
      );
      if (!saved) throw new Error("No worker artifact");
      const data = JSON.parse(await readFile(prefix + ".json"));
      report.requestsIssued = data.requestsIssued;
      if (data.status !== "complete") report.status = "failed";
    } catch (e) {
      report.status = "failed";
      report.downloadError = e.message;
      report.requestsCharged = 10;
    } finally {
      try {
        const stopped = await sandbox.stop({
          signal: AbortSignal.timeout(3000),
        });
        report.sandbox.activeCpuDurationMs =
          stopped.activeCpuDurationMs ?? null;
      } catch (e) {
        report.status = "failed";
        report.stopError = e.message;
      }
      report.sandbox.provisionedVcpuHoursUpperBound = 56000 / 3600000;
      report.sandbox.observedWallVcpuHours = (Date.now() - started) / 3600000;
    }
  }
  report.elapsedMs = Date.now() - started;
  await save();
  console.log(prefix, report.status, report.sandbox);
  if (report.status !== "complete") process.exitCode = 1;
}
