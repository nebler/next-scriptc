import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
const root = process.argv[2];
const labels = readdirSync(root).filter(f => f.endsWith(".json.gz") && !f.endsWith("-steady.json.gz")).map(f=>f.slice(0,-8)).filter(label => { const x=JSON.parse(gunzipSync(readFileSync(resolve(root,label+".json.gz")))); return Array.isArray(x.blocks); });
const median = (a) => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
const range = (a) => ({
  median: median(a),
  min: Math.min(...a),
  max: Math.max(...a),
});
const summary = {};
for (const label of labels) {
  const f = resolve(root, label + ".json.gz");
  if (!existsSync(f)) continue;
  const x = JSON.parse(gunzipSync(readFileSync(f)));
  const mapped = resolve(root, label + "-attribution.json");
  const steady = resolve(root, label + "-steady.json.gz");
  const prof = existsSync(steady)
    ? JSON.parse(gunzipSync(readFileSync(steady))).profile
    : x.profile;
  summary[label] = {
    error: x.error,
    bytes: x.responseBytes,
    equivalence: x.equivalence,
    profileN: prof?.n,
    profileCpu: prof?.cpu,
    profileWallMs: prof?.wallMs,
    attribution: existsSync(mapped)
      ? JSON.parse(readFileSync(mapped))
      : x.profile?.attribution,
    concurrency: {},
  };
  for (const c of [1, 16]) {
    const bs = x.blocks.filter((b) => b.concurrency === c);
    if (!bs.length) continue;
    summary[label].concurrency[c] = {
      n: bs.reduce((a, b) => a + b.n, 0),
      rps: range(bs.map((b) => b.rps)),
      cpuMs: range(bs.map((b) => b.cpuMsPerRequest)),
      p50: range(bs.map((b) => b.p50)),
      p95: range(bs.map((b) => b.p95)),
      wallMs: bs.reduce((a, b) => a + b.wallMs, 0),
      cpuMsTotal: bs.reduce(
        (a, b) => a + (b.cpu.user + b.cpu.system) / 1000,
        0,
      ),
      statuses: bs.map((b) => b.statuses),
    };
  }
}
writeFileSync(resolve(root, "summary.json"), JSON.stringify(summary, null, 2));
console.log(
  "| Page | C | N | CPU ms/req median [min,max] | req/s median [min,max] | p50 ms | p95 ms |",
);
console.log("|---|---:|---:|---:|---:|---:|---:|");
const fmt = (r) =>
  `${r.median.toFixed(2)} [${r.min.toFixed(2)}, ${r.max.toFixed(2)}]`;
for (const [label, x] of Object.entries(summary))
  for (const [c, b] of Object.entries(x.concurrency))
    console.log(
      `| ${label} | ${c} | ${b.n} | ${fmt(b.cpuMs)} | ${fmt(b.rps)} | ${b.p50.median.toFixed(2)} | ${b.p95.median.toFixed(2)} |`,
    );
console.log(
  "\n| Page | HTML | Flight | App | JSON/serial | Data | Routing | HTTP | GC | Other |",
);
console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const [label, x] of Object.entries(summary))
  if (x.attribution)
    console.log(
      "| " +
        label +
        " | " +
        Object.values(x.attribution.percent)
          .map((v) => v.toFixed(1))
          .join(" | ") +
        " |",
    );
