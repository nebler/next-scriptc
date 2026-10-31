import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { callNative } from "../src/functions/client.mjs";

const require = createRequire(import.meta.url);
const compiler = path.resolve(path.dirname(require.resolve("scriptc/package.json")), require("scriptc/package.json").bin.scriptc);

test("Node/native dispatcher parity, JSON return failures and thrown messages", { timeout: 120_000 }, async () => {
  const cache = path.resolve(import.meta.dirname, "../.next");
  await mkdir(cache, { recursive: true });
  const output = await mkdtemp(path.join(cache, "functions-"));
  const entry = path.join(output, "entry.ts");
  const binary = path.join(output, "functions");
  const children = [];
  try {
    await writeFile(path.join(output, "package.json"), '{"type":"module"}');
    await writeFile(path.join(output, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true, allowImportingTsExtensions: true, noEmit: true } }));
    await writeFile(entry, `import { serveFunctions } from ${JSON.stringify(path.resolve(import.meta.dirname, "../src/functions/serve.ts"))};
serveFunctions(async (id: string, body: string): Promise<unknown> => {
  if (id === "throw") throw new Error("expected native message");
  if (id === "date") return new Date();
  if (id === "undefined") return undefined;
  if (id === "nan") return NaN;
  if (id === "cycle") { const value: Record<string, unknown> = {}; value.self = value; return value; }
  return JSON.parse(body);
});`);
    await promisify(execFile)(compiler, ["build", entry, "-o", binary, "--strip", "--no-keep-llvm", "--node-islands=off"], { env: { ...process.env, SCRIPTC_CHECKER_SERVER: "0" } });
    for (const native of [false, true]) {
      const child = spawn(native ? binary : process.execPath, native ? [] : [entry], { env: { ...process.env, PORT: "0", NEXT_SCRIPTC_PARENT: "" }, stdio: ["ignore", "pipe", "pipe"] });
      const exited = new Promise((resolve) => child.once("close", resolve));
      children.push({ child, exited });
      let logs = "";
      const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(logs)), 30_000);
        child.stderr.on("data", (chunk) => { logs += chunk; });
        child.stdout.on("data", (chunk) => {
          logs += chunk;
          const match = logs.match(/listening on 127\.0\.0\.1:(\d+)/);
          if (match) { clearTimeout(timer); resolve(Number(match[1])); }
        });
        child.once("error", reject);
        child.once("exit", () => { clearTimeout(timer); reject(new Error(logs)); });
      });
      const value = [{ a: [1, true, null, "hello"] }];
      assert.deepEqual(await callNative(port, "echo", value), value);
      await assert.rejects(callNative(port, "throw", []), { message: "expected native message" });
      for (const id of ["date", "undefined", "nan", "cycle"]) await assert.rejects(callNative(port, id, []), /JSON/);
      assert.equal(await callNative(port, "echo", ["still alive"]).then((v) => v[0]), "still alive");
      child.kill("SIGTERM"); await exited;
    }
  } finally {
    for (const { child } of children) child.kill("SIGKILL");
    await Promise.all(children.map(({ exited }) => exited));
    await rm(output, { recursive: true, force: true });
  }
});
