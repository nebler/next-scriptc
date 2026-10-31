import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { serialize } from "./json.ts";

// The envelope is internal only. The wire remains POST /<function-id>, JSON
// arguments and a JSON result (or status 500 with {error: message}). Every
// result passes the shared strict validator before its typed encoder runs.
export type FunctionResult = { value: unknown; encode: () => string };

// Reserved internal RPC. Parse, validate and encode representative JSON without
// ever entering the generated dispatcher or invoking application code.
function warmup(input: string, trace: number[] | null): FunctionResult {
  const args = JSON.parse(input) as unknown[];
  if (trace) {
    trace.push(Number(process.hrtime.bigint()) / 1e6);
    trace.push(Number(process.hrtime.bigint()) / 1e6);
  }
  const value = { warmup: true, args };
  if (trace) trace.push(Number(process.hrtime.bigint()) / 1e6);
  return { value, encode: () => JSON.stringify(value) };
}

export function serveFunctions(dispatch: (id: string, body: string, trace: number[] | null) => Promise<FunctionResult>): void {
  const server = createServer(async (incoming: IncomingMessage, outgoing: ServerResponse) => {
    const trace = process.env.NEXT_SCRIPTC_CALL_TIMING === "1" ? [Number(process.hrtime.bigint()) / 1e6] : null;
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
      const input = Buffer.concat(chunks).toString("utf8");
      if (trace) trace.push(Number(process.hrtime.bigint()) / 1e6);
      const value = incoming.url === "/__warmup" ? warmup(input, trace) : await dispatch((incoming.url || "").slice(1), input, trace);
      const body = serialize(value.value, true, value.encode, trace === null ? null : () => { trace.push(Number(process.hrtime.bigint()) / 1e6); });
      if (trace) {
        trace.push(Number(process.hrtime.bigint()) / 1e6);
        outgoing.setHeader("x-scriptc-call", JSON.stringify(trace));
      }
      outgoing.setHeader("content-type", "application/json");
      outgoing.end(body);
      if (trace) {
        trace.push(Number(process.hrtime.bigint()) / 1e6);
        console.log("scriptc-call " + JSON.stringify({ side: "native", id: incoming.url, stamps: trace }));
      }
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
