import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { serialize } from "./json.ts";

export function serveFunctions(dispatch: (id: string, body: string) => Promise<unknown>): void {
  const server = createServer(async (incoming: IncomingMessage, outgoing: ServerResponse) => {
    try {
      if (incoming.method !== "POST") throw new Error("Expected POST");
      const chunks = await new Promise<Buffer[]>((resolve, reject) => {
        const chunks: Buffer[] = [];
        let ended = false;
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.on("end", () => { ended = true; resolve(chunks); });
        incoming.on("error", (error: Error) => reject(error));
        incoming.on("close", () => { if (!ended) reject(new Error("Request aborted")); });
      });
      const value = await dispatch((incoming.url || "").slice(1), Buffer.concat(chunks).toString("utf8"));
      const body = serialize(value, true);
      outgoing.setHeader("content-type", "application/json");
      outgoing.end(body);
    } catch (error) {
      outgoing.statusCode = 500;
      outgoing.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });
  const port = Number(process.env.PORT || "0");
  server.listen(port, "127.0.0.1", () => {
    const address = server.address();
    if (address && typeof address === "object") console.log(`next-scriptc: listening on 127.0.0.1:${address.port}`);
  });
  const parent = Number(process.env.NEXT_SCRIPTC_PARENT || "0");
  if (parent) setInterval(() => { if (process.ppid !== parent) process.exit(0); }, 1000).unref();
}
