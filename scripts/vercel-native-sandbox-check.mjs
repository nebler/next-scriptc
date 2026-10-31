// Run after vercel-native-smoke.mjs: node --env-file=.env.local scripts/vercel-native-sandbox-check.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Sandbox } from "@vercel/sandbox";

async function check() {
  const { createServer } = await import("node:net");
  const { spawn } = await import("node:child_process");
  const messages = [];
  const sockets = [];
  const ipc = createServer((socket) => {
    sockets.push(socket);
    let pending = "";
    socket.on("data", (chunk) => {
      pending += chunk;
      let end;
      while ((end = pending.indexOf("\0")) !== -1) {
        const message = JSON.parse(pending.slice(0, end));
        messages.push(message);
        console.log("ipc", JSON.stringify(message));
        pending = pending.slice(end + 1);
      }
    });
  });
  await new Promise((resolve) => ipc.listen("/tmp/vercel-native.sock", resolve));
  const started = performance.now();
  const proxy = spawn("./executable", [], {
    env: { ...process.env, VERCEL_IPC_PATH: "/tmp/vercel-native.sock" }, stdio: "inherit", detached: true,
  });
  try {
    for (let i = 0; i < 100 && !messages.some((message) => message.type === "server-started"); i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert(messages.some((message) => message.type === "server-started"));
    console.log("spawn-to-IPC-ready-ms", performance.now() - started);
    const cases = [
      ["/api/hello", "GET", 200, '{"message":"Hello from next-scriptc!"}'],
      ["/api/hello", "GET", 200, '{"message":"Hello from next-scriptc!"}'],
      ["/api/hello", "HEAD", 200, ""],
      ["/api/hello", "POST", 405, ""],
      ["/api/hello?greeting=1&greeting=2", "GET", 200, '{"message":"Hallo von next-scriptc!"}'],
      ["/_vercel/ping", "GET", 200, "OK"],
    ];
    for (const [index, [path, method, status, body]] of cases.entries()) {
      const response = await fetch(`http://127.0.0.1:3000${path}`, { method, headers: {
        "accept-language": index === 4 ? "de" : "en",
        "x-vercel-internal-invocation-id": `smoke-${index}`,
        "x-vercel-internal-request-id": String(index + 1),
      } });
      const text = await response.text();
      console.log(method, path, response.status, JSON.stringify(Object.fromEntries(response.headers)), text);
      assert.equal(response.status, status);
      assert.equal(text, body);
      if (index < 5) assert.equal(response.headers.get("x-next-scriptc"), "native");
    }
    for (let i = 0; i < 100 && messages.filter((message) => message.type === "end").length < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.deepEqual(messages.filter((message) => message.type === "end").map((message) => message.payload.context),
      cases.slice(0, 5).map((_, index) => ({ invocationId: `smoke-${index}`, requestId: index + 1 })));
    assert.equal(messages.filter((message) => message.type === "server-started").length, 1);
  } finally {
    process.kill(-proxy.pid, "SIGTERM");
    for (const socket of sockets) socket.destroy();
    ipc.close();
  }
}

const sandbox = await Sandbox.create({ image: "vercel/sandbox/node:24", resources: { vcpus: 1 }, timeout: 120_000, persistent: false });
console.log("sandbox", sandbox.name, "cwd", sandbox.cwd);
try {
  await sandbox.writeFiles([
    ...await Promise.all(["executable", "user-server"].map(async (name) => ({
      path: name, content: await readFile(new URL(`../.vercel/output/functions/api/hello.func/${name}`, import.meta.url)), mode: 0o755,
    }))),
    { path: "check.mjs", content: Buffer.from(`import assert from "node:assert/strict";\nawait (${check.toString()})();\n`) },
  ]);
  const result = await sandbox.runCommand({ cmd: "node", args: ["check.mjs"], cwd: sandbox.cwd, stdout: process.stdout, stderr: process.stderr });
  assert.equal(result.exitCode, 0);
} finally {
  const stopped = await sandbox.stop();
  console.log("stopped; active-vCPU-ms", stopped.activeCpuDurationMs);
}
