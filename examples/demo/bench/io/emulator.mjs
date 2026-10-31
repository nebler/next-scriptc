import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";

// An external URL is allowed only when explicitly supplied. The default owns a
// disposable Docker/SRH stack and never resets an accidentally inherited DB.
export async function emulator() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const project = `next-scriptc-io-${process.pid}`;
  const args = ["compose", "-f", path.join(import.meta.dirname, "compose.yaml"), "-p", project];
  const env = { ...process.env, IO_REDIS_PORT: String(port) };
  const run = (...rest) => execFileSync("docker", [...args, ...rest], { env, stdio: ["ignore", "pipe", "pipe"] });
  try {
    run("up", "-d", "--wait", "--wait-timeout", "60");
    const url = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) {
      try {
        const response = await fetch(url, { method: "POST", headers: { authorization: "Bearer local-redis-only", "content-type": "application/json" }, body: '["PING"]', signal: AbortSignal.timeout(1000) });
        if (response.ok && (await response.json()).result === "PONG") break;
      } catch {}
      if (i === 59) throw new Error("SRH readiness timeout");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return { env: { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: "local-redis-only" },
      async stop() { run("down", "--volumes"); } };
  } catch (error) {
    try { run("down", "--volumes"); } catch {}
    throw new Error("Local parity requires a working Docker daemon with Compose/SRH", { cause: error });
  }
}
