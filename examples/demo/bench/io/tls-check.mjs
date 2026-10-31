import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:https";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../../.."), dir = path.join(import.meta.dirname, "artifacts/tls");
await mkdir(dir, { recursive: true });
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${dir}/key.pem`, "-out", `${dir}/cert.pem`,
  "-days", "1", "-subj", "/CN=host.docker.internal", "-addext", "subjectAltName=DNS:host.docker.internal,DNS:localhost,IP:127.0.0.1"], { stdio: "ignore" });
let requests = 0, handshakeErrors = 0;
const server = createServer({ key: await readFile(`${dir}/key.pem`), cert: await readFile(`${dir}/cert.pem`) }, (req, res) => { requests++; res.end("tls-fixture"); });
server.on("tlsClientError", () => { handshakeErrors++; });
server.listen(0, "0.0.0.0"); await once(server, "listening");
const data = { startedAt: new Date().toISOString(), node: process.version, selfSignedRejectedNode: null, native: null };
try {
  try { await fetch(`https://127.0.0.1:${server.address().port}`, { signal: AbortSignal.timeout(10000) }); data.selfSignedRejectedNode = false; }
  catch (error) { data.selfSignedRejectedNode = true; data.nodeErrorCode = error.cause?.code; }
  const child = spawn("docker", ["run", "--rm", "--platform", "linux/amd64", "-v", `${path.join(import.meta.dirname, "artifacts")}:/work:ro`,
    "-e", `PROBE_INVALID_TLS=https://host.docker.internal:${server.address().port}`, "alpine:3.22", "/work/tls-musl"], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = ""; child.stdout.on("data", (c) => { stdout += c; }); child.stderr.on("data", (c) => { stderr += c; });
  const [code, signal] = await once(child, "close");
  data.native = { code, signal, stdout, stderr }; data.fixtureRequests = requests; data.fixtureHandshakeErrors = handshakeErrors;
} finally {
  await new Promise((resolve) => server.close(resolve));
  await writeFile(path.join(root, "research/benchmarks/realistic-io-tls.json"), JSON.stringify(data, null, 2) + "\n");
  console.log(JSON.stringify(data));
}
