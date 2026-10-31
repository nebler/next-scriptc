// Correctness only; no performance claims from the shared development machine.
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "./client.mjs";
import { parity } from "./parity.mjs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../../.."),
  demo = path.join(root, "examples/demo");
const children = [];
function start(cmd, args, env) {
  const p = spawn(cmd, args, {
    cwd: demo,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  p.log = "";
  for (const stream of [p.stdout, p.stderr])
    stream.on("data", (c) => (p.log += c));
  children.push(p);
  return p;
}
async function ready(url, p) {
  for (let i = 0; i < 120; i++) {
    if (p.exitCode !== null) throw new Error(p.log);
    try {
      const r = await fetch(url);
      if (r.status === 200) return;
    } catch {}
    await delay(500);
  }
  throw new Error(p.log);
}
try {
  const go = start("/tmp/heavy-go", [], { PORT: "3520" });
  await ready("http://localhost:3520/api/heavy/diagnostics", go);
  const node = start(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", "3519"],
    { NEXT_SCRIPTC_BASELINE: "node", NEXT_SCRIPTC_DEMO_GROUPS: "" },
  );
  await ready("http://localhost:3519/api/hello", node);
  const native = start(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", "3521"],
    {
      NEXT_SCRIPTC_BASELINE: "",
      NEXT_SCRIPTC_DEMO_GROUPS: "vercel",
      DEMO_PROXY_TIMEOUT_MS: "180000",
    },
  );
  await ready("http://localhost:3521/api/hello", native);
  const result = await parity(
    [
      { variant: "node", url: "http://localhost:3519" },
      { variant: "native", url: "http://localhost:3521" },
      { variant: "go", url: "http://localhost:3520" },
    ],
    createClient(),
  );
  await writeFile(
    path.join(root, "research/benchmarks/heavy-local-parity.json"),
    JSON.stringify(
      { note: "Shared macOS host; correctness only", ...result },
      null,
      2,
    ) + "\n",
  );
  console.log(`Three-way parity: ${result.cases} cases`);
} finally {
  for (const p of children.reverse()) {
    try {
      process.kill(-p.pid, "SIGTERM");
    } catch {}
    await Promise.race([new Promise((r) => p.once("exit", r)), delay(2000)]);
    try {
      process.kill(-p.pid, "SIGKILL");
    } catch {}
  }
}
