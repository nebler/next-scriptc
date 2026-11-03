import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { normalizeMain } from "./normalize.mjs";
import { concat } from "./shared/concat.js";
if (process.env.NODE_ENV !== "production")
  throw Error("Set NODE_ENV=production before importing React");
let render, rendererName = "react";
if (process.argv[3]) {
  const mod = await import(process.argv[3]);
  render = mod.render;
  rendererName = mod.name;
} else {
  const {default:React}=await import("react");
  const {renderToString}=await import("react-dom/server");
  const {Page}=await import("./shared/tree.js");
  render=()=>renderToString(React.createElement(Page));
}
const a = await render(),
  b = concat();
if (normalizeMain(a, rendererName) !== b) throw Error("HTML mismatch");
const result = {
  node: process.version,
  host: execFileSync("ps",["-A","-o","pid,pcpu,comm","-r"],{encoding:"utf8"}).split("\n").slice(0,21),
  bytes: Buffer.byteLength(a),
  sha256: createHash("sha256").update(a).digest("hex"),
  equal: a === b,
  normalizedEqual: true,
  renderer: rendererName,
  blocks: [],
};
let sink = 0;
for (const [name, fn] of [
  [rendererName, render],
  ["concat", concat],
]) {
  for (let i = 0; i < 500; i++) sink += (await fn()).length;
  for (let block = 0; block < 5; block++) {
    const cpu = process.cpuUsage(),
      t = performance.now();
    for (let i = 0; i < 2000; i++) sink += (await fn()).length;
    const elapsed = performance.now() - t,
      usage = process.cpuUsage(cpu);
    result.blocks.push({
      name,
      block,
      n: 2000,
      wallMs: elapsed,
      cpuMsPerRequest: (usage.user + usage.system) / 1000 / 2000,
    });
  }
}
result.sink = sink;
writeFileSync(process.argv[2], JSON.stringify(result, null, 2));
