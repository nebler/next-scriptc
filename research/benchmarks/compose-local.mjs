// Rebuild the indicative report from the retained, unmodified source datasets.
// Production/isolation are replaced as whole sections, never pooled with the
// earlier run that lacked process restart and complete probe warmup.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { renderReport, definitions } from "../../examples/demo/bench/report.mjs";

const files = ["local-indicative-before-restart.json", "local-indicative-production-rerun.json"];
const [full, redo] = await Promise.all(files.map(async (name) => JSON.parse(await readFile(new URL(name, import.meta.url), "utf8"))));
assert.deepEqual(full.artifacts, redo.artifacts);
for (const key of ["node", "scriptc", "next", "nativeBuildId", "nodeBuildId", "publicFixtureEnvironment"]) {
  assert.deepEqual(full.environment[key], redo.environment[key]);
}
assert.ok(full.completedSections.includes("threads"));
assert.ok(redo.completedSections.includes("isolation"));
assert.ok(!full.error && !redo.error, "Unexpected harness or integrity failure");
assert.ok(redo.rows.some((row) => row.metric === "memory-idle" && row.restartedAfter === "login"), "Restart path was not exercised");
const replaced = (row) => row.metric.startsWith("isolation-") || (row.scope === "end-to-end" && (
  ["cpu-fixed-count", "throughput-latency", "memory-idle"].includes(row.metric) ||
  (row.metric === "workload-failure" && row.phase !== "cold")
));
const rows = [
  ...full.rows.filter((row) => !replaced(row)).map((row) => ({ ...row, sourceRun: files[0] })),
  ...redo.rows.map((row) => ({ ...row, sourceRun: files[1] })),
];
// Rename the historical counter key, which counted cumulative creations before
// a window rather than live sockets. No numeric value or statistic is changed.
function normalize(value) {
  if (!value || typeof value !== "object") return;
  if ("agentSocketsAtStart" in value) {
    value.connectionsCreatedBeforeWindow = value.agentSocketsAtStart;
    delete value.agentSocketsAtStart;
  }
  for (const item of Object.values(value)) normalize(item);
}
normalize(rows);
const data = {
  ...redo, profile: full.profile, label: full.label,
  startedAt: full.resumedCold.startedAt, finishedAt: redo.finishedAt, rows, definitions,
  environment: { ...redo.environment, loadAverageStart: full.resumedCold.environment.loadAverageStart },
  resumedCold: full.resumedCold, completedSections: full.completedSections,
  composition: "One interrupted quick suite, resumed cold observations, then whole production/isolation sections replaced after the restart/probe-warmup fix. No repetitions pooled. Elapsed span includes harness edits. Only the cumulative connection-counter key was normalized; timing values are unchanged.",
  sourceRuns: [full, redo].map((run, index) => ({
    file: files[index], commit: run.environment.commit, startedAt: run.startedAt, finishedAt: run.finishedAt,
    profile: run.profile, environment: run.environment, sourceSnapshot: run.sourceSnapshot,
  })),
};
data.status = rows.some((row) => row.metric === "workload-failure") ? "failed" : "complete";
await writeFile(new URL("local-indicative.json", import.meta.url), JSON.stringify(data, null, 2) + "\n");
await writeFile(new URL("local-indicative.md", import.meta.url), renderReport(data));
console.log(`Composed local report: ${data.status}; ${rows.length} observations. Raw source runs retained; no repetitions pooled.`);
