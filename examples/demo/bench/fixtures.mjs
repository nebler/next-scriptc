// Generated once per process, outside timed requests. Public deterministic data.
import { createHash } from "node:crypto";

const upload = Buffer.alloc(1024 * 1024);
const rgba = Buffer.alloc(512 * 512 * 4);
for (let i = 0; i < upload.length; i++) upload[i] = (i * 31 + (i >>> 8)) & 255;
for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 17 + (i >>> 8)) & 255;
export const uploadSha256 = createHash("sha256").update(upload).digest("hex");
export function fixtureBody(name) {
  if (name === "upload-1mib") return upload;
  if (name === "rgba-512") return rgba;
  throw new Error(`Unknown body fixture: ${name}`);
}
