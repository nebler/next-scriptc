import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { request } from "node:http";
import { callNative } from "../src/functions/client.mjs";

const require = createRequire(import.meta.url);
const compiler = path.resolve(path.dirname(require.resolve("scriptc/package.json")), require("scriptc/package.json").bin.scriptc);

test("Node/native JSON parity, typed encoding, HTTP framing, concurrency and crash rejection", { timeout: 120_000 }, async () => {
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
async function dispatch(id: string, body: string): Promise<unknown> {
  if (id === "delay") {
    const args = JSON.parse(body) as [number, string];
    await new Promise<void>((resolve) => setTimeout(resolve, args[0]));
    return args[1];
  }
  if (id === "throw") throw new Error("expected native message");
  if (id === "date") return new Date();
  if (id === "undefined") return undefined;
  if (id === "nan") return NaN;
  if (id === "extra") { const value = JSON.parse('{"value":1}') as Record<string, unknown>; value.hidden = undefined; return value as { value: number }; }
  if (id === "getter") return { get value() { throw new Error("getter invoked"); } };
  if (id === "sparse") return Array(1);
  if (id === "symbol") return { [Symbol("hidden")]: 1 };
  if (id === "nestedNan") return { rows: [{ value: Infinity }] };
  if (id === "cycle") { const value: Record<string, unknown> = {}; value.self = value; return value; }
  return JSON.parse(body);
}
function hide(value: unknown): void { Object.defineProperty(value, "hidden", { value: undefined }); }
let dispatchCalls = 0;
serveFunctions(async (id: string, body: string) => {
  if (id === "dispatch-count") { const value = dispatchCalls; return { value, encode: () => JSON.stringify(value) }; }
  dispatchCalls++;
  if (id === "typed-extra") {
    const value = { a: 1 };
    const alias = value as Record<string, unknown>;
    alias.extra = true;
    return { value, encode: () => JSON.stringify(value) };
  }
  if (id === "typed-hidden") {
    const value = { a: 1 };
    hide(value);
    return { value, encode: () => { throw new Error("encoder ran before validation"); } };
  }
  if (id === "typed") {
    const shared = { value: "λ😀\\n\\u0000" };
    const value = { numbers: [-0, 1e-7, 1e21, 1.7976931348623157e308, 5e-324], children: [shared, shared], empty: {}, nil: null };
    return { value, encode: () => JSON.stringify(value) };
  }
  const value = await dispatch(id, body);
  return { value, encode: () => JSON.stringify(value) };
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
      assert.deepEqual(await callNative(port, "__warmup", []), { warmup: true, args: [] });
      assert.equal(await callNative(port, "dispatch-count", []), 0, "warm-up must bypass user dispatch entirely");
      const pending = callNative(port, "delay", [50, "concurrent real call"]);
      assert.deepEqual(await callNative(port, "__warmup", []), { warmup: true, args: [] });
      assert.equal(await pending, "concurrent real call");
      assert.equal(await callNative(port, "dispatch-count", []), 1);
      const value = [{ a: [1, true, null, "hello"] }];
      assert.deepEqual(await callNative(port, "echo", value), value);
      assert.deepEqual(await callNative(port, "typed-extra", []), { a: 1, extra: true });
      await assert.rejects(callNative(port, "typed-hidden", []), { message: "[next-scriptc] JSON serialization failed: JSON properties must be enumerable data properties" });
      assert.deepEqual(await callNative(port, "typed", []), { numbers: [0, 1e-7, 1e21, Number.MAX_VALUE, Number.MIN_VALUE], children: [{ value: "λ😀\n\u0000" }, { value: "λ😀\n\u0000" }], empty: {}, nil: null });
      await assert.rejects(callNative(port, "throw", []), { message: "expected native message" });
      for (const id of ["date", "undefined", "nan", "cycle", "extra", "getter", "sparse", "symbol", "nestedNan"]) await assert.rejects(callNative(port, id, []), /JSON/, `${native ? "native" : "Node"}/${id}`);
      assert.equal(await callNative(port, "echo", ["still alive"]).then((v) => v[0]), "still alive");
      // HTTP supplies framing and response routing. Fragment a multi-byte body across
      // writes, and mix delayed successes and failures on concurrent sockets.
      const fragmented = ["λ😀".repeat(4000)];
      const bytes = Buffer.from(JSON.stringify(fragmented));
      const response = await new Promise((resolve, reject) => {
        const req = request({ hostname: "127.0.0.1", port, method: "POST", path: "/echo", headers: { "content-length": bytes.length } }, (res) => {
          let text = ""; res.setEncoding("utf8");
          res.on("data", (chunk) => { text += chunk; });
          res.on("end", () => {
            try { resolve(JSON.parse(text)); } catch (error) { reject(error); }
          });
          res.on("error", reject);
        });
        req.on("error", reject);
        req.write(bytes.subarray(0, 2));
        setTimeout(() => { req.write(bytes.subarray(2, 20003)); req.end(bytes.subarray(20003)); }, 5);
      });
      assert.deepEqual(response, fragmented);
      await Promise.all(Array.from({ length: 32 }, async (_, index) => {
        if (index % 5 === 0) await assert.rejects(callNative(port, "throw", []), { message: "expected native message" });
        else assert.equal(await callNative(port, "delay", [32 - index, `call-${index}`]), `call-${index}`);
      }));
      const inFlight = Array.from({ length: 16 }, () => assert.rejects(callNative(port, "delay", [30000, "pending"]), /Native process unavailable/));
      await new Promise((resolve) => setTimeout(resolve, 50));
      child.kill("SIGKILL");
      await Promise.all(inFlight);
      await exited;
    }
  } finally {
    for (const { child } of children) child.kill("SIGKILL");
    await Promise.all(children.map(({ exited }) => exited));
    await rm(output, { recursive: true, force: true });
  }
});
