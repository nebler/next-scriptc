// macOS: node examples/scout/dashboard/profile.mjs (after run.mjs).
import { spawn, spawnSync } from "node:child_process";
import { openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout } from "node:timers/promises";

const dir = import.meta.dirname, out = path.join(dir, ".artifacts");
for (const variant of ["native", "go", "go-v2", "node"]) {
  const command = variant === "node" ? process.execPath : path.join(out, variant === "go-v2" ? "go" : variant);
  const args = variant === "node" ? ["--cpu-prof", `--cpu-prof-dir=${out}`, "--cpu-prof-name=node.cpuprofile", path.join(dir, "dashboard.ts")] : [];
  const child = spawn(command, args, { env: { ...process.env, INPUT: path.join(out, "200000.json"),
    OUTPUT: path.join(out, "profile-output.json"), ITERATIONS: variant === "native" ? "800" : "180", WARMUP: "10", PROFILE: "0",
    VARIANT: variant === "go-v2" ? "v2" : "typed", CPUPROFILE: variant.startsWith("go") ? path.join(out, `${variant}.pprof`) : "" },
    stdio: ["ignore", openSync(path.join(out, `${variant}-profile-run.json`), "w"), "inherit"] });
  const done = new Promise((resolve, reject) => child.once("exit", code => code === 0 ? resolve() : reject(new Error(`${variant}: ${code}`))));
  await setTimeout(750);
  if (variant === "native") {
    const sample = spawnSync("/usr/bin/sample", [String(child.pid), "5", "1", "-file", path.join(out, `${variant}-sample.txt`)], { encoding: "utf8" });
    if (sample.status !== 0) { child.kill(); throw new Error(sample.stderr); }
    console.log(sample.stdout.trim());
  }
  await done;
  if (variant.startsWith("go")) {
    const pprof = spawnSync(process.env.GO ?? "/opt/homebrew/bin/go", ["tool", "pprof", "-top", "-nodecount=30", path.join(out, "go"), path.join(out, `${variant}.pprof`)], { encoding: "utf8" });
    if (pprof.status !== 0) throw new Error(pprof.stderr);
    writeFileSync(path.join(out, `${variant}-pprof.txt`), pprof.stdout);
  }
}
const profile = JSON.parse(readFileSync(path.join(out, "node.cpuprofile")));
const nodes = new Map(profile.nodes.map(n => [n.id, n]));
const counts = new Map();
for (let i = 0; i < profile.samples.length; i++) {
  const frame = nodes.get(profile.samples[i]).callFrame;
  const name = `${frame.functionName || "(anonymous)"} ${frame.url}:${frame.lineNumber + 1}`;
  counts.set(name, (counts.get(name) ?? 0) + profile.timeDeltas[i]);
}
writeFileSync(path.join(out, "node-profile-top.json"), JSON.stringify([...counts].sort((a,b) => b[1]-a[1]).slice(0,25), null, 2));
console.log(path.join(out, "node-profile-top.json"));
