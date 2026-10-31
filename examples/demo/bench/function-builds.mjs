// Local, serial paired builds. Temporarily edits only discovered directives and
// the loader configuration, restoring exact bytes even after a failed build.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import path from "node:path";
import { discoverFunctions } from "../../../packages/next-scriptc/src/functions/extract.mjs";
import { demo, run } from "../test/function-harness.mjs";

const root = path.resolve(demo, "../..");
const configFile = path.join(root, "packages/next-scriptc/src/functions/config.mjs");
const config = await readFile(configFile, "utf8");
const broad = execFileSync("git", ["show", "9af72da:packages/next-scriptc/src/functions/config.mjs"], { cwd: root, encoding: "utf8" });
const modules = await discoverFunctions(demo, path.join(demo, ".next"));
const originals = new Map(await Promise.all(modules.map(async ({ source }) => [source, await readFile(source, "utf8")])));
const result = { commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), cpu: cpus()[0].model, node: process.version, platform: `${process.platform}/${process.arch}`, method: "three serial builds per mode; rotating order; retained Next caches; identical native routes; no-modules removes only directives", originalBroadConfigSha256: createHash("sha256").update(broad).digest("hex"), runs: [] };
try {
  for (const order of [["targeted", "none", "broad"], ["none", "broad", "targeted"], ["broad", "targeted", "none"]]) {
    for (const mode of order) {
      await writeFile(configFile, mode === "broad" ? broad : config);
      for (const [source, text] of originals) await writeFile(source, mode === "none" ? text.replaceAll('"use native"', '"use javascript"') : text);
      const begin = performance.now();
      const state = run(["build"]);
      let compiling, nativeMs;
      state.child.stdout.on("data", () => {
        if (compiling === undefined && /Compiling \d+ native function/.test(state.output)) compiling = performance.now();
        if (nativeMs === undefined && /native functions → native PID/.test(state.output)) nativeMs = performance.now() - compiling;
      });
      const { code } = await state.exit;
      assert.equal(code, 0, state.output);
      const row = { mode, elapsedMs: performance.now() - begin, nativeCompileAndStartMs: nativeMs ?? 0,
        nextCompile: state.output.match(/Compiled successfully in ([^\n]+)/)?.[1] };
      result.runs.push(row);
      console.log(JSON.stringify(row));
    }
  }
} finally {
  await writeFile(configFile, config);
  for (const [source, text] of originals) await writeFile(source, text);
  const destination = process.argv.find((arg) => arg.startsWith("--output="))?.slice(9);
  if (destination) await writeFile(destination, JSON.stringify(result, null, 2) + "\n");
}
