// Validate the actual grouped Linux executable's diagnostic before deployment.
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Sandbox } from "@vercel/sandbox";

async function check() {
  const { createServer } = await import("node:net");
  const { spawn, execFileSync } = await import("node:child_process");
  const { readFileSync, readdirSync } = await import("node:fs");
  const hz = Number(execFileSync("getconf", ["CLK_TCK"], { encoding: "utf8" }));
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
  const native = spawn("./executable", [], { env: { ...process.env, VERCEL_IPC_PATH: "/tmp/memory-check.sock" }, detached: true });
  const observations = [];
  const ticks = (pid) => {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
    return { user: Number(fields[11]), system: Number(fields[12]) };
  };
  const verify = (api, proc) => {
    for (const field of ["user", "system"]) {
      assert(Number.isFinite(api[field]) && api[field] >= 0);
      assert(Math.abs(api[field] / 1000 - proc[field] * 1000 / hz) < 50,
        `${field}: CPU API ${api[field]} us disagrees with procfs ${proc[field]} ticks`);
    }
  };
  try {
    for (let i = 0; i < 100 && !messages.some((m) => m.type === "server-started"); i++) await new Promise((r) => setTimeout(r, 50));
    const handshake = messages.find((m) => m.type === "server-started");
    assert(handshake);
    const origin = `http://127.0.0.1:${handshake.payload.httpPort}`;
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${origin}/api/diagnostics/memory`);
      assert.equal(res.status, 200);
      const body = await res.json();
      const status = readFileSync(`/proc/${body.pid}/status`, "utf8");
      const externalRss = Number(status.match(/^VmRSS:\s+(\d+)/m)[1]) * 1024;
      const externalCpuTicks = ticks(body.pid);
      const observation = { ...body, externalRss, externalCpuTicks,
        threads: readdirSync(`/proc/${body.pid}/task`).length };
      observations.push(observation);
      // Persist raw observations before any assertion can abort the checker.
      await (await import("node:fs/promises")).writeFile("observations.json", JSON.stringify(observations, null, 2));
      assert(body.rss > 0 && body.procRss > 0 && body.peakRss >= body.procRss);
      assert(Math.abs(body.rss - body.procRss) < 2 * 1024 * 1024);
      assert(Math.abs(body.procRss - externalRss) < 2 * 1024 * 1024);
      verify(body.cpu, body.procCpuTicks);
      verify(body.cpu, externalCpuTicks);
      if (i) {
        const before = observations[i - 1];
        assert.equal(body.instance, before.instance);
        const apiDeltaMs = (body.cpu.user + body.cpu.system - before.cpu.user - before.cpu.system) / 1000;
        const procDeltaMs = (body.procCpuTicks.user + body.procCpuTicks.system - before.procCpuTicks.user - before.procCpuTicks.system) * 1000 / hz;
        observation.apiDeltaMs = apiDeltaMs;
        observation.procDeltaMs = procDeltaMs;
        assert(apiDeltaMs > 100 && procDeltaMs > 100, "CPU counters must increase under real work");
        assert(Math.abs(apiDeltaMs - procDeltaMs) < 50, "CPU delta disagreement >=50 ms");
      }
      if (i < 2) {
        // Real unmodified route work, enough to exceed procfs tick quantization.
        for (let j = 0; j < 12; j++) {
          const work = await fetch(`${origin}/api/primes?limit=10000000`);
          assert.equal(work.status, 200);
          assert.equal((await work.json()).count, 664579);
        }
      }
    }
    const cpuBefore = process.cpuUsage(), procBefore = ticks("self");
    const worker = new (await import("node:worker_threads")).Worker(`const end=Date.now()+300; while(Date.now()<end) { Math.sqrt(Math.random()); }`, { eval: true });
    await new Promise((resolve, reject) => { worker.on("exit", resolve); worker.on("error", reject); });
    const cpuAfter = process.cpuUsage(), procAfter = ticks("self");
    verify(cpuAfter, procAfter);
    const nodeDeltaMs = (cpuAfter.user + cpuAfter.system - cpuBefore.user - cpuBefore.system) / 1000;
    const nodeProcDeltaMs = (procAfter.user + procAfter.system - procBefore.user - procBefore.system) * 1000 / hz;
    assert(nodeDeltaMs > 100 && Math.abs(nodeDeltaMs - nodeProcDeltaMs) < 50);
    const rss = process.memoryUsage().rss;
    const status = readFileSync("/proc/self/status", "utf8");
    const procRss = Number(status.match(/^VmRSS:\s+(\d+)/m)[1]) * 1024;
    return { node: process.version, platform: process.platform, hz, observations, nodeObservation: {
      rss, procRss, cpuBefore, cpuAfter, procBefore, procAfter, nodeDeltaMs, nodeProcDeltaMs,
      scope: "process including worker-thread CPU" }, handshake };
  } finally {
    process.kill(-native.pid, "SIGTERM");
    for (const socket of sockets) socket.destroy();
    await new Promise((r) => ipc.close(r));
  }
}

const started = Date.now();
const destination = process.argv[2] ?? "research/benchmarks/vercel-final-linux.json";
const data = { checkedAt: new Date().toISOString(), scriptc: "0.4.6", status: "running" };
let sandbox;
try {
  const content = await readFile(".vercel/output/functions/api/analytics/revenue.func/executable");
  const build = JSON.parse(await readFile(".vercel/native-build.json"));
  data.sourceCommit = build.sourceCommit;
  data.artifactSha256 = createHash("sha256").update(content).digest("hex");
  sandbox = await Sandbox.create({ image: "vercel/sandbox/node:24", region: "iad1", resources: { vcpus: 1 }, timeout: 90_000, persistent: false });
  data.sandbox = { id: sandbox.name, region: sandbox.region, vcpus: sandbox.vcpus };
  await sandbox.writeFiles([
    { path: "executable", content, mode: 0o755 },
    { path: "check.mjs", content: Buffer.from(`import assert from "node:assert/strict";\ntry { const data = await (${check.toString()})(); await (await import("node:fs/promises")).writeFile("result.json", JSON.stringify(data, null, 2)); } catch (error) { console.error(error); process.exitCode = 1; }`) },
  ]);
  const command = await sandbox.runCommand({ cmd: "node", args: ["check.mjs"], stdout: process.stdout, stderr: process.stderr, signal: AbortSignal.timeout(75_000) });
  data.exitCode = command.exitCode;
  const observations = await sandbox.readFileToBuffer({ path: "observations.json" });
  if (observations) data.observations = JSON.parse(observations.toString());
  assert.equal(command.exitCode, 0);
  const result = await sandbox.readFileToBuffer({ path: "result.json" });
  Object.assign(data, JSON.parse(result.toString()), { status: "complete" });
} catch (error) { data.status = "failed"; data.error = error.message; process.exitCode = 1; }
finally {
  if (sandbox) {
    const stopped = await sandbox.stop();
    data.sandbox.activeCpuDurationMs = stopped.activeCpuDurationMs ?? null;
    data.sandbox.provisionedVcpuHours = (Date.now() - started) / 3_600_000;
  }
  await writeFile(destination, JSON.stringify(data, null, 2) + "\n");
  console.log(`Linux check: ${data.status}; ${destination}`);
}
