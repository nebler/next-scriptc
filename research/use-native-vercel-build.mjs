import { buildDemo } from "../examples/demo/bench/vercel/build.mjs";
import { readFile, writeFile, copyFile, realpath } from "node:fs/promises";
import path from "node:path";

if (process.env.NATIVE_VERCEL_TIMING !== "1") throw new Error("Set NATIVE_VERCEL_TIMING=1");
const metadata = await buildDemo();
const owners = new Set();
for (const name of ["reports.func", "reports.rsc.func"]) {
  const owner = await realpath(path.resolve(".vercel/output/functions", name));
  if (owners.has(owner)) continue;
  owners.add(owner);
  const configPath = path.join(owner, ".vc-config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const launcher = path.join(owner, config.handler);
  const helper = path.join(path.dirname(launcher), "report-timing.cjs");
  await copyFile("examples/demo/bench/vercel/report-timing.cjs", helper);
  // Keep the original launcher (and its dirname semantics) intact.
  const wrapper = path.join(path.dirname(launcher), "timed-launcher.cjs");
  await writeFile(wrapper, `const wrap = require('./report-timing.cjs');\nconst original = require('./${path.basename(launcher)}');\nmodule.exports = wrap(original);\nmodule.exports.getRequestHandlerWithMetadata = metadata => wrap(original.getRequestHandlerWithMetadata(metadata));\n`);
  config.handler = path.relative(owner, wrapper);
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
}
await writeFile(`/tmp/use-native-${metadata.variant}-build.json`, JSON.stringify(metadata, null, 2));
