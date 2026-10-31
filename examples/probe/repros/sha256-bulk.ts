import { createHash } from "node:crypto";

const bytes = Buffer.alloc(1024 * 1024);
for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + (i >>> 8)) & 255;
function hash(): string {
  return createHash("sha256").update(bytes).digest("hex");
}
console.log(hash());
for (let i = 0; i < 50; i++) hash();
const count = Number(process.env.REPRO_COUNT ?? "200");
const start = performance.now();
let last = "";
for (let i = 0; i < count; i++) last = hash();
console.log(JSON.stringify({ count, ms: performance.now() - start, last }));
