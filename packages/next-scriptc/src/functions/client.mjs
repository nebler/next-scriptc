import { request } from "node:http";
import { serialize } from "./json.mjs";
import { sidecar, nativeAgent as agent } from "./sidecar.mjs";

export async function callNative(port, id, args) {
  const trace = process.env.NEXT_SCRIPTC_CALL_TIMING === "1" ? { start: Number(process.hrtime.bigint()) / 1e6 } : null;
  const cpu = trace ? { start: process.cpuUsage() } : null;
  const mark = (stage) => {
    if (trace) trace[stage] = Number(process.hrtime.bigint()) / 1e6;
    if (cpu) cpu[stage] = process.cpuUsage();
  };
  const body = serialize(args);
  mark("serialized");
  if (sidecar) port = await sidecar.port();
  mark("port");
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, method: "POST", path: `/${id}`, agent, headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } }, (response) => {
      mark("headers");
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("error", reject);
      response.on("end", () => {
        try {
          mark("body");
          const result = JSON.parse(text);
          mark("parsed");
          if (trace) console.error("scriptc-call " + JSON.stringify({ side: "client", id, stamps: trace, cpu, reused: req.reusedSocket, native: response.headers["x-scriptc-call"] }));
          if (response.statusCode !== 200) reject(new Error(result.error ?? "[next-scriptc] Native call failed"));
          else resolve(result);
        } catch (error) { reject(error); }
      });
    });
    req.setTimeout(30_000, () => req.destroy(new Error("[next-scriptc] Native call timed out")));
    req.on("error", (cause) => reject(new Error(`[next-scriptc] Native process unavailable: ${cause.message}`, { cause })));
    if (trace) req.on("socket", (socket) => {
      mark("socket");
      if (socket.connecting) socket.once("connect", () => mark("connect"));
    });
    req.end(body, trace ? () => mark("write") : undefined);
  });
}
