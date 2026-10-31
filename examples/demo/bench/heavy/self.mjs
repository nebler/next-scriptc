// Linux production-hop comparison. Run from a frozen committed archive.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { start, ready, census, stop } from "../processes.mjs";
import { workloads, metadata, digest } from "./fixtures.mjs";
import { createClient } from "./client.mjs";
import { parity } from "./parity.mjs";
const root = path.resolve(import.meta.dirname, "../../../.."),
  demo = path.join(root, "examples/demo");
const port = 3519,
  goPort = 3520;
const cpus = process.env.HEAVY_APP_CPUS;
const client = createClient({ budget: 10000 });
const output = process.argv[2] ?? path.resolve("heavy-self.json");
const report = {
  status: "running",
  sourceCommit: process.env.BENCH_COMMIT,
  node: process.version,
  startedAt: new Date().toISOString(),
  machine: {
    cpu: await readFile("/proc/cpuinfo", "utf8"),
    cpuMax: await readFile("/sys/fs/cgroup/cpu.max", "utf8").catch(
      () => "unavailable",
    ),
    appCpus: cpus,
    generatorAffinity: execFileSync("taskset", ["-pc", String(process.pid)], {
      encoding: "utf8",
    }),
    ticks: Number(execFileSync("getconf", ["CLK_TCK"])),
  },
  variants: [],
};
const owned = [];
async function save() {
  report.requestsIssued = client.issued;
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
}
async function snapshot(procs) {
  const trees = await Promise.all(procs.map((p) => census(p)));
  return {
    trees,
    cpuMs: trees.reduce((s, t) => s + t.cpuMs, 0),
    rssBytes: trees.reduce((s, t) => s + t.rssBytes, 0),
  };
}
async function accounting(procs, fn) {
  const before = await snapshot(procs);
  let peak = before,
    pending = Promise.resolve(),
    busy = false,
    samplingError;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    pending = snapshot(procs)
      .then((s) => {
        if (s.rssBytes > peak.rssBytes) peak = s;
      })
      .catch((e) => {
        samplingError = e;
      })
      .finally(() => {
        busy = false;
      });
  }, 100);
  try {
    const result = await fn();
    clearInterval(timer);
    await pending;
    if (samplingError) throw samplingError;
    const after = await snapshot(procs);
    if (after.rssBytes > peak.rssBytes) peak = after;
    if (
      before.trees
        .flatMap((t) => t.processes.map((p) => p.pid))
        .sort()
        .join() !==
      after.trees
        .flatMap((t) => t.processes.map((p) => p.pid))
        .sort()
        .join()
    )
      throw new Error("Process tree changed");
    return {
      result,
      accounting: {
        before,
        after,
        peak,
        cpuMs: after.cpuMs - before.cpuMs,
        cpuMsPerRequest: result.requests
          ? (after.cpuMs - before.cpuMs) / result.requests
          : null,
      },
    };
  } finally {
    clearInterval(timer);
    await pending;
  }
}
const references = new Map();
report.artifacts = {};
for (const dir of [".next", ".next-node"]) {
  report.artifacts[dir] = {
    buildId: (await readFile(path.join(demo, dir, "BUILD_ID"), "utf8")).trim(),
    prerendered: Object.keys(
      JSON.parse(
        await readFile(path.join(demo, dir, "prerender-manifest.json")),
      ).routes,
    ),
  };
  if (report.artifacts[dir].prerendered.some((p) => p.startsWith("/api/heavy")))
    throw new Error("Heavy route was prerendered");
}
const manifest = JSON.parse(
  await readFile(path.join(demo, ".next/scriptc/manifest.json")),
);
report.artifacts.nativeManifest = manifest;
report.artifacts.nativeBinaries = {};
for (const entry of manifest.processes)
  report.artifacts.nativeBinaries[entry.binary] = digest(
    await readFile(path.join(demo, ".next/scriptc", entry.binary)),
  );

try {
  for (const phase of ["validation", "measurement"])
    for (const variant of ["node", "native", "go"]) {
      const procs = [];
      const row =
        phase === "validation"
          ? { variant, rows: [], logs: [] }
          : report.variants.find((v) => v.variant === variant);
      if (phase === "validation") report.variants.push(row);
      try {
        if (variant === "go") {
          const p = start(path.join(demo, "go/user-server"), [], {
            cwd: demo,
            env: { PORT: String(goPort) },
            cpus,
          });
          owned.push(p);
          procs.push(p);
          await ready(p, `http://localhost:${goPort}`, {
            path: "/api/heavy/diagnostics",
          });
        }
        const p = start(
          process.execPath,
          [
            path.join(demo, "node_modules/next/dist/bin/next"),
            "start",
            "-p",
            String(port),
          ],
          {
            cwd: demo,
            env: {
              NEXT_SCRIPTC_BASELINE: variant === "native" ? "" : "node",
              NEXT_SCRIPTC_DEMO_GROUPS: variant === "native" ? "vercel" : "",
              HEAVY_GO_ORIGIN: `http://127.0.0.1:${goPort}`,
              DEMO_PROXY_TIMEOUT_MS: "",
            },
            cpus,
          },
        );
        owned.push(p);
        procs.push(p);
        await ready(p, `http://localhost:${port}`, { path: "/api/hello" });
        const base = `http://localhost:${port}`,
          prefix = variant === "go" ? "/api/heavy-go/" : "/api/heavy/";
        // All sizes plus edge contracts. Cross-variant digests are checked before their timings.
        if (phase === "validation") {
          const validationPool = client.agent(base, 1);
          row.validationCpuBefore = await client.request(
            base,
            { path: prefix + "diagnostics", diagnostic: true },
            validationPool,
          );
          row.parity = await parity([{ variant, url: base, prefix }], client);
          for (const [i, record] of row.parity.rows.entries()) {
            const hash = record.results[0].digest;
            if (references.has(i) && references.get(i) !== hash)
              throw Object.assign(new Error(`Parity case ${i}`), {
                correctness: true,
              });
            references.set(i, hash);
          }
          row.validationCpuAfter = await client.request(
            base,
            { path: prefix + "diagnostics", diagnostic: true },
            validationPool,
          );
          validationPool.destroy();
          const a = row.validationCpuBefore.body,
            b = row.validationCpuAfter.body;
          const processUs =
            b.cpu.user + b.cpu.system - a.cpu.user - a.cpu.system;
          const procUs =
            ((b.procCpuTicks.user +
              b.procCpuTicks.system -
              a.procCpuTicks.user -
              a.procCpuTicks.system) *
              1000000) /
            report.machine.ticks;
          row.cpuValidation = {
            processUs,
            procUs,
            differenceUs: processUs - procUs,
            status:
              a.instance === b.instance &&
              processUs > 0 &&
              Math.abs(processUs - procUs) < 50000
                ? "complete"
                : "failed",
          };
          if (row.cpuValidation.status !== "complete")
            throw new Error("Process CPU/procfs validation failed");
          continue;
        }
        const pool = client.agent(base, 1);
        try {
          row.diagnosticBefore = await client.request(
            base,
            { path: prefix + "diagnostics", diagnostic: true },
            pool,
          );
        } finally {
          pool.destroy();
        }
        for (const s of workloads()) {
          const result = { ...metadata(s), status: "running" };
          row.rows.push(result);
          await save();
          try {
            const original = s.path;
            s.path = original.replace("/api/heavy/", prefix);
            s.expected = row.parity.rows.find(
              (r) => r.id === s.id && r.size === s.size,
            ).results[0].digest;
            const pool = client.agent(base, 1);
            try {
              result.reference = await client.request(base, s, pool);
            } finally {
              pool.destroy();
            }
            result.sequential = await client.window(
              base,
              s,
              1,
              s.id === "bcrypt" ? 1 : 5,
              { count: s.id === "bcrypt" ? 3 : 40 },
              (fn) => accounting(procs, fn),
            );
            if (result.sequential.error)
              throw Object.assign(new Error(result.sequential.error), {
                correctness: result.sequential.correctness,
              });
            result.concurrent = await client.window(
              base,
              s,
              16,
              s.id === "bcrypt" ? 0 : { count: 100, durationMs: 1000 },
              s.id === "bcrypt"
                ? { count: 16 }
                : { count: 100, durationMs: 2000 },
              (fn) => accounting(procs, fn),
            );
            if (result.concurrent.error) {
              row.skipDiagnosticAfter = true;
              throw Object.assign(new Error(result.concurrent.error), {
                correctness: result.concurrent.correctness,
              });
            }
            result.status = "complete";
          } catch (e) {
            result.status = "failed";
            result.error = e.message;
            if (e.correctness) throw e;
          }
          console.log(variant, s.id, result.status);
          await save();
        }
        const last = client.agent(base, 1);
        try {
          if (!row.skipDiagnosticAfter)
            row.diagnosticAfter = await client.request(
              base,
              { path: prefix + "diagnostics", diagnostic: true },
              last,
            );
        } finally {
          last.destroy();
        }
        row.status = row.rows.some((r) => r.status !== "complete")
          ? "failed"
          : "complete";
      } finally {
        row.logs.push({ phase, processes: procs.map((p) => p.output) });
        for (const p of procs.reverse()) await stop(p);
        await save();
      }
    }
  report.status = report.variants.every((v) => v.status === "complete")
    ? "complete"
    : "failed";
} catch (e) {
  report.status = "failed";
  report.error = e.stack;
  console.error(e.stack);
  for (const p of owned) console.error(p.output);
  process.exitCode = 1;
} finally {
  for (const p of owned.reverse()) await stop(p);
  report.finishedAt = new Date().toISOString();
  await save();
}
