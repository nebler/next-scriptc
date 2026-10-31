import { Agent, request } from "node:http";
import { serialize } from "./json.ts";
import { sidecar } from "./sidecar.mjs";

const agent = new Agent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 8 });

export async function callNative(port, id, args) {
  const body = serialize(args);
  if (sidecar) port = await sidecar.port();
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, method: "POST", path: `/${id}`, agent, headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("error", reject);
      response.on("end", () => {
        try {
          const result = JSON.parse(text);
          if (response.statusCode !== 200) reject(new Error(result.error ?? "[next-scriptc] Native call failed"));
          else resolve(result);
        } catch (error) { reject(error); }
      });
    });
    req.setTimeout(30_000, () => req.destroy(new Error("[next-scriptc] Native call timed out")));
    req.on("error", (cause) => reject(new Error(`[next-scriptc] Native process unavailable: ${cause.message}`, { cause })));
    req.end(body);
  });
}
