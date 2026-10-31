import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import https from "node:https";
import { serverEnv } from "../examples/demo/bench/config.mjs";

const directory = "research/use-native-vercel";
mkdirSync(directory, { recursive: true });
const save = (name, data) => writeFileSync(`${directory}/${name}.json`, JSON.stringify(data, null, 2) + "\n");
const load = name => JSON.parse(readFileSync(`${directory}/${name}.json`, "utf8"));
const secret = parseEnv(readFileSync(".env.local", "utf8")).VERCEL_AUTOMATION_BYPASS_SECRET;
assert(secret, "Missing private bypass");
const pools = new Map();
function request(url, size) {
  if (!pools.has(url)) pools.set(url, new https.Agent({ keepAlive: true, maxSockets: 1 }));
  return new Promise((resolve, reject) => {
    const begin = performance.now();
    const req = https.get(`${url}/reports?size=${size}`, { agent: pools.get(url), headers: { "x-vercel-protection-bypass": secret, "accept-encoding": "identity" } }, res => {
      let html = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { html += chunk; });
      res.on("error", reject);
      res.on("end", () => {
        try {
          assert.equal(res.statusCode, 200, `HTTP ${res.statusCode}`);
          assert(!["HIT", "STALE", "PRERENDER"].includes(res.headers["x-vercel-cache"]));
          const match = /<pre id="result">([\s\S]*?)<\/pre>/.exec(html);
          assert(match, "No report result");
          const json = match[1].replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
          assert.equal(JSON.parse(json).events, size);
          const timing = res.headers["server-timing"] ?? "";
          const functionMs = Number(/function;dur=([\d.]+)/.exec(timing)?.[1]);
          const renderMs = Number(/render;dur=([\d.]+)/.exec(timing)?.[1]);
          assert(Number.isFinite(functionMs) && Number.isFinite(renderMs), "Missing server timing");
          resolve({ functionMs, renderMs, e2eMs: performance.now() - begin, digest: createHash("sha256").update(json).digest("hex"), instance: res.headers["x-native-instance"], readyBeforeCall: res.headers["x-native-ready-before-call"], bootMs: res.headers["x-native-boot-ms"], attempts: res.headers["x-native-attempts"], pid: res.headers["x-native-pid"], requestId: res.headers["x-vercel-id"] });
        } catch (error) { reject(error); }
      });
    });
    req.setTimeout(30_000, () => req.destroy(new Error("Request timed out")));
    req.on("error", reject);
  });
}

try {
  const mode = process.argv[2];
  if (["node", "native"].includes(mode)) {
    assert(!existsSync(`${directory}/${mode}.json`), "Refusing duplicate deployment label");
    assert.equal(JSON.parse(readFileSync(".vercel/project.json")).projectName, "next-scriptc");
    execFileSync(process.execPath, ["examples/demo/bench/vercel/archive/startup-deploy.mjs", "check-traces"], { stdio: "inherit" });
    const args = ["deploy", "--prebuilt", "--regions", "iad1", "--environment", "preview", "--force", "--json"];
    for (const [key, value] of Object.entries({ ...serverEnv, NATIVE_VERCEL_TIMING: "1" })) args.push("--env", `${key}=${value}`);
    const result = JSON.parse(execFileSync("vercel", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
    const deployment = result.deployment ?? result;
    const row = { mode, id: deployment.id, url: `https://${deployment.url.replace(/^https:\/\//, "")}`, sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), status: "accepted" };
    save(mode, row);
    const info = JSON.parse(execFileSync("vercel", ["inspect", row.url, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
    assert.notEqual(info.target, "production");
    assert.equal(info.readyState, "READY");
    const functions = new Map();
    for (const build of info.builds ?? []) for (const output of build.output ?? []) if (output.lambda) functions.set(output.lambda.functionName, { runtime: output.lambda.runtime, bytes: output.size });
    assert(functions.size <= 12);
    row.functions = [...functions.values()];
    row.status = "ready"; save(mode, row);
    row.first = await request(row.url, 5000);
    row.status = "complete"; save(mode, row);
    console.log(JSON.stringify(row));
  } else if (mode === "measure") {
    const deployments = [load("node"), load("native")];
    assert(deployments.every(d => d.status === "complete"));
    assert.equal(deployments[0].first.digest, deployments[1].first.digest);
    const report = { protocol: { warmup: 10, samples: 40, concurrency: 1, order: "alternate variant order each pair" }, rows: [], status: "running" };
    save("measurements", report);
    for (const size of [5000, 15000, 200000]) {
      const rows = deployments.map(d => ({ mode: d.mode, size, warmup: [], samples: [] }));
      report.rows.push(...rows);
      let digest;
      for (let i = 0; i < 50; i++) {
        for (const index of i % 2 ? [1, 0] : [0, 1]) {
          const sample = await request(deployments[index].url, size);
          digest ??= sample.digest;
          assert.equal(sample.digest, digest, "All complete result JSON bytes must match");
          if (index === 1) assert.equal(sample.attempts, "1", "Native child must actually run without restarts");
          (i < 10 ? rows[index].warmup : rows[index].samples).push(sample);
        }
        save("measurements", report);
      }
      const quantile = (xs, q) => xs.toSorted((a,b) => a-b)[Math.ceil(xs.length*q)-1];
      for (const row of rows) {
        row.summary = { p50: quantile(row.samples.map(x=>x.functionMs), .5), p95: quantile(row.samples.map(x=>x.functionMs), .95), renderP50: quantile(row.samples.map(x=>x.renderMs), .5), instances: [...new Set(row.samples.map(x=>x.instance))] };
        console.log(JSON.stringify({ mode: row.mode, size, ...row.summary }));
      }
    }
    report.status = "complete"; save("measurements", report);
  } else throw new Error("Supply node, native or measure");
} finally { for (const pool of pools.values()) pool.destroy(); }
