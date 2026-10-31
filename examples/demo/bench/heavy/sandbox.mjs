// Controller: fresh frozen git archive only. Secrets never enter that archive.
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../../..");
process.chdir(root);
const hosted = process.argv.includes("--hosted");
const attempt = process.argv
  .find((arg) => arg.startsWith("--attempt="))
  ?.split("=")[1];
if (attempt && !/^[a-z0-9-]+$/.test(attempt))
  throw new Error("Invalid attempt label");
const prefix = `research/benchmarks/heavy-${hosted ? "vercel" : "self"}${attempt ? "-" + attempt : ""}`;
try {
  await access(`${prefix}-controller.json`);
  throw new Error(
    "Run already exists; inspect evidence before any separate retry",
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const git = (...args) =>
  execFileSync("git", args, { maxBuffer: 128 * 1024 * 1024 });
const commit = git("rev-parse", "HEAD").toString().trim();
if (
  git(
    "diff",
    "HEAD",
    "--",
    "examples/demo",
    "packages/next-scriptc",
    "pnpm-lock.yaml",
  ).length
)
  throw new Error("Commit measured source first");
if (
  process.version !== "v24.22.0" ||
  process.env.NODE_OPTIONS ||
  process.env.DEMO_PROXY_TIMEOUT_MS
)
  throw new Error("Use untuned Node 24.22.0/default proxy timeout");
const vcpus = hosted ? 2 : 4;
const lifetime = hosted ? 540000 : 480000;
const report = {
  status: "running",
  sourceCommit: commit,
  startedAt: new Date().toISOString(),
  steps: [],
  hardLifetimeMs: lifetime,
};
const started = Date.now();
let sandbox;
async function save() {
  await mkdir(path.dirname(prefix), { recursive: true });
  await writeFile(
    `${prefix}-controller.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
}
async function step(label, script, sudo = false, timeout = 300000) {
  console.log(label);
  const start = Date.now();
  const r = await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", `set -euo pipefail\n${script}`],
    sudo,
    stdout: process.stdout,
    stderr: process.stderr,
    signal: AbortSignal.timeout(
      Math.max(
        1000,
        Math.min(timeout, lifetime - (Date.now() - started) - 30000),
      ),
    ),
  });
  report.steps.push({
    label,
    elapsedMs: Date.now() - start,
    exitCode: r.exitCode,
  });
  await save();
  if (r.exitCode !== 0) throw new Error(`${label} exit ${r.exitCode}`);
}
try {
  if (hosted) {
    const linux = JSON.parse(
      await readFile(
        process.env.HEAVY_LINUX_REFERENCE ??
          "research/benchmarks/heavy-self.json",
      ),
    );
    if (
      linux.variants.length !== 3 ||
      linux.variants.some((v) => v.cpuValidation?.status !== "complete")
    )
      throw new Error("Linux process CPU validation required");
    if (!process.env.VERCEL_AUTOMATION_BYPASS_SECRET)
      throw new Error("Load ignored bypass secret");
    const job = JSON.parse(await readFile(".vercel/heavy-job.json"));
    const probes = JSON.parse(
      await readFile("research/benchmarks/heavy-vercel-vcpu.json"),
    );
    job.externalDiagnosticRequests = probes.requestsIssued;
    job.requestBudget = 20000 - probes.requestsIssued;
    if (job.requestBudget <= 0) throw new Error("Invocation budget exhausted");
    report.job = job;
    sandbox = await Sandbox.create({
      image: "vercel/sandbox/node:24",
      region: "iad1",
      resources: { vcpus },
      timeout: lifetime,
      persistent: false,
    });
    report.sandbox = { id: sandbox.name, region: sandbox.region, vcpus };
    await save();
    const files = ["client.mjs", "fixtures.mjs", "hosted.mjs"];
    const hash = createHash("sha256");
    const uploaded = await Promise.all(
      files.map(async (name) => {
        const content = await readFile(`examples/demo/bench/heavy/${name}`);
        hash.update(name).update(content);
        return { path: `examples/demo/bench/heavy/${name}`, content };
      }),
    );
    report.clientSha256 = hash.digest("hex");
    await sandbox.writeFiles([
      ...uploaded,
      { path: "heavy-job.json", content: Buffer.from(JSON.stringify(job)) },
    ]);
    const r = await sandbox.runCommand({
      cmd: "timeout",
      args: [
        "--signal=TERM",
        "--kill-after=5s",
        "510s",
        "node",
        "examples/demo/bench/heavy/hosted.mjs",
      ],
      env: {
        VERCEL_AUTOMATION_BYPASS_SECRET:
          process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      },
      stdout: process.stdout,
      stderr: process.stderr,
      signal: AbortSignal.timeout(520000),
    });
    report.workerExit = r.exitCode;
    if (r.exitCode !== 0) throw new Error("Hosted worker failed");
  } else {
    const archive = git("archive", "--format=tar", "HEAD");
    report.archiveSha256 = createHash("sha256").update(archive).digest("hex");
    sandbox = await Sandbox.create({
      image: "vercel/sandbox/node:24",
      region: "iad1",
      resources: { vcpus },
      timeout: lifetime,
      persistent: false,
    });
    report.sandbox = { id: sandbox.name, region: sandbox.region, vcpus };
    await save();
    await sandbox.writeFiles([
      { path: "repo.tar", content: archive },
      {
        path: "heavy-go",
        content: await readFile(".vercel/heavy-user-server"),
        mode: 0o755,
      },
    ]);
    report.goBinarySha256 = createHash("sha256")
      .update(await readFile(".vercel/heavy-user-server"))
      .digest("hex");
    await step(
      "CPU tools",
      `if ! command -v clang >/dev/null || ! command -v taskset >/dev/null; then if command -v dnf >/dev/null; then dnf install -y -q clang util-linux; else apt-get update -qq && apt-get install -y -qq clang util-linux; fi; fi\nnode --version\nnproc\ncat /sys/fs/cgroup/cpu.max`,
      true,
      120000,
    );
    await step(
      "Install frozen archive",
      `mkdir repo\ntar -xf repo.tar -C repo\ncd repo\nnpx -y pnpm@11.1.3 install --frozen-lockfile --reporter=silent\ncp ../heavy-go examples/demo/go/user-server\nchmod +x examples/demo/go/user-server`,
      false,
      120000,
    );
    await step(
      "Build native then Node",
      `cd repo\nSCRIPTC_CHECKER_SERVER=0 NEXT_SCRIPTC_DEMO_GROUPS=vercel HEAVY_GO_ORIGIN=http://127.0.0.1:3520 npx -y pnpm@11.1.3 --filter demo build\nNEXT_SCRIPTC_BASELINE=node NEXT_SCRIPTC_DEMO_GROUPS= HEAVY_GO_ORIGIN=http://127.0.0.1:3520 npx -y pnpm@11.1.3 --filter demo build`,
      false,
      180000,
    );
    await step(
      "Production three-way",
      `cd repo\nBENCH_COMMIT=${commit} HEAVY_APP_CPUS=0,1 taskset -c 2,3 node examples/demo/bench/heavy/self.mjs /vercel/sandbox/heavy-self.json`,
      false,
      360000,
    );
  }
  report.status = "complete";
} catch (e) {
  report.status = "failed";
  report.error = e.message;
  process.exitCode = 1;
  console.error(e.message);
} finally {
  if (sandbox) {
    try {
      const saved = await sandbox.downloadFile(
        { path: `heavy-${hosted ? "hosted" : "self"}.json` },
        { path: `${prefix}.json` },
        { signal: AbortSignal.timeout(15000) },
      );
      if (!saved) throw new Error("No worker artifact");
      const data = JSON.parse(await readFile(`${prefix}.json`));
      report.requestsIssued = data.requestsIssued;
      if (data.status !== "complete") report.status = "failed";
    } catch (e) {
      report.downloadError = e.message;
      report.status = "failed";
      if (hosted) report.requestsCharged = report.job?.requestBudget ?? 20000;
    } finally {
      try {
        const stopped = await sandbox.stop({
          signal: AbortSignal.timeout(20000),
        });
        report.sandbox.activeCpuDurationMs =
          stopped.activeCpuDurationMs ?? null;
      } catch (e) {
        report.stopError = e.message;
        report.status = "failed";
      }
      report.sandbox.provisionedVcpuHoursUpperBound =
        (lifetime * vcpus) / 3600000;
      report.sandbox.observedWallVcpuHours =
        ((Date.now() - started) * vcpus) / 3600000;
    }
  }
  report.elapsedMs = Date.now() - started;
  await save();
  console.log(prefix, report.status, report.sandbox);
  if (report.status !== "complete") process.exitCode = 1;
}
