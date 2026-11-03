import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import React from "react";
import { renderToString } from "react-dom/server";
import { Page } from "./shared/tree.js";
import { concat } from "./shared/concat.js";
if (process.env.NODE_ENV !== "production")
  throw Error("Set NODE_ENV=production before importing React");
const render = () => renderToString(React.createElement(Page));
const a = render(),
  b = concat();
if (a !== b) throw Error("HTML mismatch");
const result = {
  node: process.version,
  bytes: Buffer.byteLength(a),
  sha256: createHash("sha256").update(a).digest("hex"),
  equal: true,
  blocks: [],
};
let sink = 0;
for (const [name, fn] of [
  ["react", render],
  ["concat", concat],
]) {
  for (let i = 0; i < 500; i++) sink += fn().length;
  for (let block = 0; block < 5; block++) {
    const cpu = process.cpuUsage(),
      t = performance.now();
    for (let i = 0; i < 2000; i++) sink += fn().length;
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
