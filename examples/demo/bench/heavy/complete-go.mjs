// Complete only previously unmeasured Go rows. Keep the failed full run unchanged.
import { Sandbox } from "@vercel/sandbox";
import { readFile, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const prefix = "research/benchmarks/heavy-vercel-go";
try {
  await access(prefix + "-controller.json");
  throw new Error("Go completion already started");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const prior = JSON.parse(
  await readFile("research/benchmarks/heavy-vercel.json"),
);
const control = JSON.parse(
  await readFile("research/benchmarks/heavy-vercel-controller.json"),
);
if (control.status !== "failed" || prior.rows.some((r) => r.variant === "go"))
  throw new Error("Requires a failed run with no measured Go row");
const last = prior.rows.at(-1);
if (
  last.variant !== "native" ||
  last.id !== "thumbnail" ||
  last.cpu?.attempts?.length !== 2
)
  throw new Error("Audit interrupted stage before accounting unknown requests");
// Last persisted save follows a complete CPU attempt. At most the next 20 work
// requests plus two diagnostics could have been issued before timeout. A later
// attempt would require another successful save, which is absent.
const priorAttemptUpperBound = prior.requestsIssued + 22 + 3; // includes three allocation probes
const lifetime = 210000,
  vcpus = 1;
const totalUpper =
  control.sandbox.observedWallVcpuHours + (lifetime * vcpus) / 3600000;
if (totalUpper > 0.35 || priorAttemptUpperBound >= 20000)
  throw new Error("Registered hosted budget exhausted");
const target = prior.targets.find((t) => t.variant === "go");
const inspect = JSON.parse(
  execFileSync("vercel", ["inspect", target.url, "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }),
);
if (
  inspect.id !== target.deploymentId ||
  inspect.target === "production" ||
  inspect.readyState !== "READY"
)
  throw new Error("Preview identity drift");
const references = Object.fromEntries(
  prior.correctness
    .filter((r) => r.size)
    .map((r) => [`${r.id}:${r.size}`, r.results[0].digest]),
);
const job = {
  targets: [
    {
      variant: target.variant,
      url: target.url,
      prefix: target.prefix,
      deploymentId: target.deploymentId,
    },
  ],
  references,
  requestBudget: 20000 - priorAttemptUpperBound,
};
const report = {
  status: "running",
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  startedAt: new Date().toISOString(),
  prior: "heavy-vercel.json",
  method:
    "Go-only missing-stage completion; different 1-vCPU iad1 generator, no measured row repeated",
  priorAttemptUpperBound,
  hostedHoursUpperBound: totalUpper,
  job,
};
const started = Date.now();
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
    resources: { vcpus },
    timeout: lifetime,
    persistent: false,
  });
  report.sandbox = { id: sandbox.name, region: sandbox.region, vcpus };
  await save();
  const hash = createHash("sha256");
  const files = await Promise.all(
    ["client.mjs", "fixtures.mjs", "hosted.mjs"].map(async (name) => {
      const content = await readFile(`examples/demo/bench/heavy/${name}`);
      hash.update(name).update(content);
      return { path: `examples/demo/bench/heavy/${name}`, content };
    }),
  );
  report.clientSha256 = hash.digest("hex");
  await sandbox.writeFiles([
    ...files,
    { path: "heavy-job.json", content: Buffer.from(JSON.stringify(job)) },
  ]);
  const r = await sandbox.runCommand({
    cmd: "timeout",
    args: [
      "--signal=TERM",
      "--kill-after=5s",
      "180s",
      "node",
      "examples/demo/bench/heavy/hosted.mjs",
    ],
    env: {
      VERCEL_AUTOMATION_BYPASS_SECRET:
        process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    },
    stdout: process.stdout,
    stderr: process.stderr,
    signal: AbortSignal.timeout(190000),
  });
  report.workerExit = r.exitCode;
  if (r.exitCode !== 0) throw new Error("Go completion worker failed");
  report.status = "complete";
} catch (e) {
  report.status = "failed";
  report.error = e.message;
  process.exitCode = 1;
} finally {
  if (sandbox) {
    try {
      const saved = await sandbox.downloadFile(
        { path: "heavy-hosted.json" },
        { path: prefix + ".json" },
        { signal: AbortSignal.timeout(10000) },
      );
      if (!saved) throw new Error("No artifact");
      const data = JSON.parse(await readFile(prefix + ".json"));
      report.requestsIssued = data.requestsIssued;
      if (data.status !== "complete") report.status = "failed";
    } catch (e) {
      report.status = "failed";
      report.downloadError = e.message;
      report.requestsCharged = job.requestBudget;
    } finally {
      try {
        const stopped = await sandbox.stop({
          signal: AbortSignal.timeout(15000),
        });
        report.sandbox.activeCpuDurationMs =
          stopped.activeCpuDurationMs ?? null;
      } catch (e) {
        report.status = "failed";
        report.stopError = e.message;
      }
      report.sandbox.provisionedVcpuHoursUpperBound = lifetime / 3600000;
      report.sandbox.observedWallVcpuHours = (Date.now() - started) / 3600000;
    }
  }
  report.elapsedMs = Date.now() - started;
  await save();
  if (report.status !== "complete") process.exitCode = 1;
  console.log(prefix, report.status, report.sandbox);
}
