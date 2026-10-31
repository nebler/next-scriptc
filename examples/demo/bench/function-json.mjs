// In-process legacy/batched validation comparison on Node and scriptc.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";

const require = createRequire(path.resolve(import.meta.dirname, "../../../packages/next-scriptc/package.json"));
const compiler = path.resolve(path.dirname(require.resolve("scriptc/package.json")), require("scriptc/package.json").bin.scriptc);
const cache = path.resolve(import.meta.dirname, "../.next/cache");
await mkdir(cache, { recursive: true });
const directory = await mkdtemp(path.join(cache, "function-json-"));
try {
  const entry = path.join(directory, "entry.ts");
  const binary = path.join(directory, "profile");
  await writeFile(path.join(directory, "package.json"), '{"type":"module"}');
  await writeFile(path.join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true, allowImportingTsExtensions: true, noEmit: true } }));
  await writeFile(entry, `import { profileSerializers } from ${JSON.stringify(path.join(import.meta.dirname, "function-profile.ts"))};\nprofileSerializers().then((value) => console.log(JSON.stringify(value)));\n`);
  const run = promisify(execFile);
  await run(compiler, ["build", entry, "-o", binary, "--optimization", "release", "--strip", "--no-keep-llvm", "--node-islands=off"], { env: { ...process.env, SCRIPTC_CHECKER_SERVER: "0" } });
  const results = { node: process.version, scriptc: require("scriptc/package.json").version, platform: `${process.platform}/${process.arch}` };
  for (const native of [false, true]) {
    const { stdout } = await run(native ? binary : process.execPath, native ? [] : [entry]);
    results[native ? "native" : "nodeRuntime"] = JSON.parse(stdout);
  }
  assert.equal(results.nodeRuntime[1].rows, 248);
  assert.equal(results.native[1].rows, 248);
  assert.deepEqual(results.nodeRuntime.map(({ bytes }) => bytes), results.native.map(({ bytes }) => bytes));
  console.log(JSON.stringify(results, null, 2));
} finally { await rm(directory, { recursive: true, force: true }); }
