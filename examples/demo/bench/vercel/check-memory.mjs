// Verify the actual grouped Linux artifact before deploying it.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Sandbox } from "@vercel/sandbox";

async function check() {
  const { createServer } = await import("node:net");
  const { spawn } = await import("node:child_process");
  const { readFileSync } = await import("node:fs");
  const messages = [], sockets = [];
  const ipc = createServer((socket) => {
    sockets.push(socket);
    let pending = "";
    socket.on("data", (chunk) => {
      pending += chunk;
      let end;
      while ((end = pending.indexOf("\0")) !== -1) {
        messages.push(JSON.parse(pending.slice(0, end)));
        pending = pending.slice(end + 1);
      }
    });
  });
  await new Promise((resolve) => ipc.listen("/tmp/memory-check.sock", resolve));
  const proxy = spawn("./executable", [], { env: { ...process.env, VERCEL_IPC_PATH: "/tmp/memory-check.sock" }, detached: true });
  const observations = [];
  try {
    for (let i = 0; i < 100 && !messages.some((m) => m.type === "server-started"); i++) await new Promise((r) => setTimeout(r, 50));
    assert(messages.some((m) => m.type === "server-started"));
    for (let i = 0; i < 3; i++) {
      const res = await fetch("http://127.0.0.1:3000/api/diagnostics/memory");
      assert.equal(res.status, 200);
      const body = await res.json();
      const status = readFileSync(`/proc/${body.pid}/status`, "utf8");
      const externalRss = Number(status.match(/^VmRSS:\s+(\d+)/m)[1]) * 1024;
      assert(body.rss > 0 && body.procRss > 0 && body.peakRss >= body.procRss);
      observations.push({ ...body, externalRss, rssMinusProc: body.rss - body.procRss });
    }
    // Also observe the Node API against procfs in this same Linux environment.
    const rss = process.memoryUsage().rss;
    const status = readFileSync("/proc/self/status", "utf8");
    const procRss = Number(status.match(/^VmRSS:\s+(\d+)/m)[1]) * 1024;
    const result = { node: process.version, platform: process.platform, observations, nodeObservation: { rss, procRss }, handshake: messages.find((m) => m.type === "server-started") };
    console.log(JSON.stringify(result, null, 2));
    await (await import("node:fs/promises")).writeFile("result.json", JSON.stringify(result, null, 2));
  } finally {
    process.kill(-proxy.pid, "SIGTERM");
    for (const socket of sockets) socket.destroy();
    await new Promise((r) => ipc.close(r));
  }
}

const started = Date.now();
const sandbox = await Sandbox.create({ image: "vercel/sandbox/node:24", region: "iad1", resources: { vcpus: 1 }, timeout: 90_000, persistent: false });
const destination = "research/benchmarks/vercel-memory-linux.json";
let data = { sandbox: { id: sandbox.name, region: sandbox.region, vcpus: sandbox.vcpus } };
try {
  await sandbox.writeFiles([
    ...await Promise.all(["executable", "user-server"].map(async (name) => ({ path: name, content: await readFile(`.vercel/output/functions/api/analytics/revenue.func/${name}`), mode: 0o755 }))),
    { path: "check.mjs", content: Buffer.from(`import assert from "node:assert/strict";\nawait (${check.toString()})();`) },
  ]);
  const command = await sandbox.runCommand({ cmd: "node", args: ["check.mjs"], stdout: process.stdout, stderr: process.stderr });
  assert.equal(command.exitCode, 0);
  const result = await sandbox.readFileToBuffer({ path: "result.json" });
  Object.assign(data, JSON.parse(result.toString()));
} finally {
  const stopped = await sandbox.stop();
  data.sandbox.activeCpuDurationMs = stopped.activeCpuDurationMs ?? null;
  data.sandbox.provisionedVcpuHours = (Date.now() - started) / 3_600_000;
  await writeFile(destination, JSON.stringify(data, null, 2) + "\n");
}
