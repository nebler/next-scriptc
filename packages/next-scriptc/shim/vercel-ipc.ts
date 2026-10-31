import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createConnection } from "node:net";

// Vercel's executable runtime routes HTTP directly to the announced loopback
// port. IPC is one persistent stream of NUL-terminated JSON, not HTTP.
export function createVercelServer(handle: (incoming: IncomingMessage, outgoing: ServerResponse) => void | Promise<void>) {
  const started = Date.now();
  const socket = createConnection(process.env.VERCEL_IPC_PATH!);
  let connected = false;
  let port = 0;
  function announce(): void {
    if (connected && port) socket.write(JSON.stringify({ type: "server-started", payload: { initDuration: Date.now() - started, httpPort: port } }) + "\0");
  }
  socket.once("connect", () => { connected = true; announce(); });
  socket.on("error", (error: Error) => { console.error(error); process.exit(1); });
  // A lost lifecycle channel makes this instance unusable; let the host replace it.
  socket.once("close", () => process.exit(1));
  const server = createServer((incoming, outgoing) => {
    let pathname = (incoming.url || "/").split("?")[0];
    try { pathname = decodeURIComponent(pathname); } catch { /* Dispatch malformed paths through the shim's 400 response. */ }
    if (pathname === "/_vercel/ping") {
      incoming.resume();
      outgoing.end("OK");
      return;
    }
    const invocation = incoming.headers["x-vercel-internal-invocation-id"];
    const id = incoming.headers["x-vercel-internal-request-id"];
    // Preserve the protocol's uint64 JSON number without a JS Number roundtrip.
    let requestId = typeof id === "string" && /^\d+$/.test(id) ? id.replace(/^0*/, "") || "0" : "0";
    const max = "18446744073709551615";
    if (requestId.length > max.length || (requestId.length === max.length && requestId > max)) requestId = max;
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      if (typeof invocation === "string" && invocation) {
        socket.write(`{"type":"end","payload":{"context":{"invocationId":${JSON.stringify(invocation)},"requestId":${requestId}}}}\0`);
      }
    };
    // finish covers flushed responses; close also covers failed streams and
    // disconnected upload/download clients. Neither waits for keep-alive close.
    outgoing.once("finish", end);
    outgoing.once("close", end);
    void handle(incoming, outgoing);
  });
  server.once("listening", () => {
    const address = server.address();
    if (address && typeof address === "object") port = address.port;
    announce();
  });
  return server;
}

export function vercelRequestHeaders(incoming: IncomingMessage): string[] {
  // The platform's internal invocation headers are for the runtime, not the handler.
  const rawHeaders = incoming.rawHeaders;
  const headers: string[] = [];
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (!rawHeaders[i].toLowerCase().startsWith("x-vercel-internal-")) headers.push(rawHeaders[i], rawHeaders[i + 1]);
  }
  return headers;
}
