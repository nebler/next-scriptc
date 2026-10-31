import assert from "node:assert/strict";
import { test } from "node:test";
import { chmod, mkdtemp, mkdir, readFile, writeFile, symlink, rm } from "node:fs/promises";
import { createSidecar, nativeAgent } from "../src/functions/sidecar.mjs";
import path from "node:path";
import { discoverFunctions, extractFunctions } from "../src/functions/extract.mjs";
import loader from "../src/functions/loader.mjs";
import { serialize } from "../src/functions/json.ts";
import { serializeLegacy } from "../../../examples/demo/bench/function-json-legacy.ts";

const source = "/project/app/page.tsx";
const extract = (text) => extractFunctions(text, source);

test("sidecar shares eager startup, strips IPC env, restarts once, and fails loudly", async () => {
  const temporary = await mkdtemp(path.join(import.meta.dirname, ".sidecar-"));
  const binary = path.join(temporary, "server.cjs");
  const old = process.env.VERCEL_IPC_PATH;
  process.env.VERCEL_IPC_PATH = "/must-not-reach-child";
  let sidecar;
  try {
    await writeFile(binary, `#!${process.execPath}\nconst http = require('node:http');\nif (Object.keys(process.env).some(k => k.startsWith('VERCEL_IPC'))) process.exit(9);\nconst s = http.createServer((q,r) => r.end(String(process.pid)));\ns.listen(Number(process.env.PORT), '127.0.0.1', () => console.log('next-scriptc: listening on 127.0.0.1:' + s.address().port));\n`, { mode: 0o755 });
    sidecar = createSidecar(binary);
    assert.equal(sidecar.state.attempts, 1, "eager before any call");
    const first = sidecar.port();
    assert.equal(first, sidecar.port(), "concurrent callers share startup");
    const port = await first;
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), String(sidecar.state.pid));
    const exited = async () => {
      process.kill(sidecar.state.pid, "SIGKILL");
      const deadline = Date.now() + 3000;
      while (sidecar.state.ready && Date.now() < deadline) await new Promise(r => setTimeout(r, 5));
      assert.equal(sidecar.state.ready, false);
    };
    await exited();
    const restart = sidecar.port();
    assert.equal(restart, sidecar.port());
    await restart;
    assert.equal(sidecar.state.attempts, 2);
    await exited();
    await assert.rejects(sidecar.port(), /exited after restart/);
    const missing = createSidecar(path.join(temporary, "missing"));
    try { await assert.rejects(missing.port(), /Cannot start native functions sidecar/); }
    finally { missing.stop(); }
  } finally {
    sidecar?.stop();
    if (old === undefined) delete process.env.VERCEL_IPC_PATH;
    else process.env.VERCEL_IPC_PATH = old;
    await rm(temporary, { recursive: true, force: true });
  }
});

test("extracts only the dependency closure; keeps types and source bodies", () => {
  const text = `import { connection } from "next/server";
import { data, type Row } from "./data.ts";
import { Suspense } from "react";
type Result = { sum: number };
const factor = 2;
function sum(rows: Row[]) { return rows.length * factor; }
async function report(count: number): Promise<Result> { "use native"; return { sum: sum(data) + count }; }
export default async function Page() { await connection(); return <Suspense>{(await report(2)).sum}</Suspense>; }`;
  const module = extract(text);
  assert.equal(module.functions.length, 1);
  assert.deepEqual(module.functions[0].params, ["count"]);
  assert.match(module.native, /type Result/);
  assert.match(module.native, /const factor = 2/);
  assert.match(module.native, /\/project\/app\/data.ts/);
  assert.doesNotMatch(module.native, /Suspense|connection|function Page/);
  const transformed = loader.call({ resourcePath: source, getOptions: () => ({ modules: { [source]: module }, port: 41000, client: "/client.mjs", server: true }) }, text);
  assert.match(transformed, /return __scriptc_.*\(41000, ".*", \[count\]\)/);
  assert.match(transformed, /export default async function Page/);
  assert.doesNotMatch(transformed, /return \{ sum: sum\(data\)/);
  assert.throws(() => loader.call({ resourcePath: source, getOptions: () => ({ modules: { [source]: module }, server: false }) }, text), /browser or Edge/);
  assert.throws(() => loader.call({ resourcePath: source, getOptions: () => ({ modules: { [source]: module }, server: true }) }, text + " "), /changed after discovery/);
});

test("file directive selects named exported async declarations and aliases", () => {
  const module = extract(`"use native"; function helper(x: number) { return x + 1; } export async function add(x: number) { return helper(x); } const echo = async (x: string) => { return x; }; export { echo as renamed };`);
  assert.deepEqual(module.functions.map((fn) => fn.name), ["add", "echo"]);
  assert.match(module.native, /function helper/);
  assert.equal(extract(`"use native"; export type { Row } from "./types"; export async function f() { return 1; }`).functions.length, 1);
  assert.equal(extract(`"use native"; export const named = async function inner(x: number) { return x; };`).functions[0].name, "named");
  assert.equal(extract(`async function plain() { return 1; }`), null);
});

test("rejects the old directive without treating strings or comments as directives", () => {
  for (const text of [
    '"use scriptc"; export async function old() { return 1; }',
    '"use strict"; "use scriptc"; export async function old() { return 1; }',
    'async function old() { "use scriptc"; return 1; }',
    'const old = async () => { "use scriptc"; return 1; };',
    'function Page() { async function old() { "use scriptc"; return 1; } }',
    '"use native"; export async function old() { "use scriptc"; return 1; }',
  ]) assert.throws(() => extract(text), /\/project\/app\/page.tsx: "use scriptc" was renamed to "use native"/);
  assert.equal(extract('// "use scriptc"\nexport const text = "use scriptc";'), null);
  assert.equal(extract('async function plain() { const x = 1; "use scriptc"; return x; }'), null);
});

test("rejects unsupported scopes, APIs and exports with the function name", () => {
  for (const [text, expected] of [
    ['export function bad() { "use native"; return 1; }', /function bad: must be async/],
    ['"use native"; export const bad = 1;', /function bad: all value exports/],
    ['"use native"; export default async function bad() {}', /function <exports>/],
    ['"use native"; export { f } from "./other";', /function <exports>/],
    ['"use client"; export async function bad() { "use native"; }', /function bad:.*use client/],
    ['function Page() { const local = 1; async function bad() { "use native"; return local; } }', /function bad:.*component-scope/],
    ['import { connection } from "next/server"; async function bad() { "use native"; return connection(); }', /function bad: reference connection.*next\/server/],
    ['import { cache } from "react"; async function bad() { "use native"; return cache(() => 1); }', /function bad: reference cache.*react/],
    ['function helper() { return process.env.KEY; } async function bad() { "use native"; return helper(); }', /function bad: unsupported reference process/],
    ['async function bad() { "use native"; return fetch("/"); }', /function bad: unsupported reference fetch/],
    ['async function bad() { "use native"; return this; }', /function bad: unsupported reference this/],
    ['async function bad() { "use native"; return <span />; }', /function bad: React\/JSX is unsupported/],
    ['async function bad() { "use native"; return <>text</>; }', /function bad: React\/JSX is unsupported/],
    ['async function bad({x}: {x:number}) { "use native"; return x; }', /function bad: parameters/],
    ['const values: number[] = []; values.push(1); async function bad() { "use native"; return values; }', /function bad: unsupported module initialization/],
    ['let value = 1; value++; async function bad() { "use native"; return value; }', /function bad: reference value is reassigned/],
  ]) assert.throws(() => extract(text), expected, text);
});

test("JSON boundary rejects lossy values instead of silently coercing them", () => {
  const value = { a: [1, null, "text", true], b: {} };
  assert.deepEqual(JSON.parse(serialize(value)), value);
  const shared = { n: 1 };
  for (const valid of [null, false, 42, "text", [], {}, value, [shared, shared]]) {
    assert.equal(serialize(valid), serializeLegacy(valid));
    assert.equal(serialize(valid, true), serializeLegacy(valid));
    assert.equal(serialize(valid), JSON.stringify(valid));
    assert.equal(serialize(valid, true, () => JSON.stringify(valid)), JSON.stringify(valid));
  }
  let encodings = 0;
  assert.equal(serialize(value, true, () => { encodings++; return JSON.stringify(value); }), JSON.stringify(value));
  assert.equal(encodings, 1, "valid data uses the supplied typed encoder once");
  const customArray = Object.setPrototypeOf([1], null);
  assert.equal(serialize(customArray), serializeLegacy(customArray));
  assert.throws(() => serialize(customArray, true), /JSON/);
  const cyclic = {}; cyclic.self = cyclic;
  const hidden = Object.defineProperty({}, "x", { value: undefined });
  const getter = { get x() { return 1; } };
  const extra = [1]; extra.x = 2;
  const holeAndExtra = Array(1); holeAndExtra.extra = 1;
  for (const invalid of [holeAndExtra, undefined, NaN, Infinity, 1n, () => 1, Symbol(), new Date(), new Map(), { x: undefined }, [undefined], Array(2), cyclic, hidden, getter, extra, { [Symbol()]: 1 }]) {
    let encoded = false;
    assert.throws(() => serialize(invalid, true, () => { encoded = true; return "null"; }), /JSON/);
    assert.equal(encoded, false, "typed encoding follows complete strict validation");
    assert.throws(() => serialize(invalid), /JSON/);
    assert.throws(() => serialize(invalid, true), /JSON/);
    assert.throws(() => serializeLegacy(invalid), /JSON/);
  }
});

test("discovery supports inline route functions and rejects indirect Next/client imports through aliases", async () => {
  const temporary = await mkdtemp(path.join(import.meta.dirname, ".functions-"));
  try {
    await symlink(path.resolve(import.meta.dirname, "../../../examples/demo/node_modules"), path.join(temporary, "node_modules"));
    await mkdir(path.join(temporary, "app"));
    await mkdir(path.join(temporary, "lib"));
    await writeFile(path.join(temporary, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, paths: { "@lib/*": ["./lib/*"] }, moduleResolution: "bundler" } }));
    await writeFile(path.join(temporary, "app/route.ts"), 'import { helper } from "@lib/helper"; async function native() { "use native"; return helper(); } export async function GET() { return Response.json(await native()); }');
    const helper = path.join(temporary, "lib/helper.ts");
    const config = { experimental: {}, typescript: { tsconfigPath: "tsconfig.json" } };
    for (const [text, error] of [
      ['import { connection } from "next/server"; export function helper() { return connection(); }', /function native: reference helper: unsupported import next\/server/],
      ['"use client"; export function helper() { return 1; }', /function native: reference helper: import of client module/],
      ['export function helper() { return <>text</>; }', /function native: reference helper: unsupported React\/JSX/],
    ]) {
      await writeFile(helper, text);
      await assert.rejects(discoverFunctions(temporary, path.join(temporary, ".next"), config), error);
    }
    await writeFile(helper, 'export function helper() { return 1; }');
    assert.equal((await discoverFunctions(temporary, path.join(temporary, ".next"), config)).length, 1);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("Turbopack conditions target discovered paths literally and preserve user rules", async () => {
  const { withFunctions } = await import("../src/functions/config.mjs");
  const existing = { loaders: ["user-loader"] };
  const modules = [{ source: "/repo/app/items/[id]/page.tsx", hash: "hash", functions: [] }];
  const config = withFunctions({ turbopack: { root: "/repo", rules: { "*": existing, "*.svg": { as: "*.js" } } } }, modules, 41000, "/repo");
  assert.equal(config.turbopack.rules["*"][0], existing);
  const condition = config.turbopack.rules["*"][1].condition.all[0].any[0].path;
  assert.ok(condition.test("app/items/[id]/page.tsx"));
  assert.ok(!condition.test("app/items/i/page.tsx"));
  assert.ok(!condition.test("other/app/items/[id]/page.tsx"));
  assert.ok(!condition.test("app/page.tsx"));
  assert.deepEqual(config.turbopack.rules["*.svg"], { as: "*.js" });
});

test("function startup checks build identity and reports missing/non-executable binaries", async () => {
  const { startFunctions } = await import("../src/functions/build.mjs");
  const temporary = await mkdtemp(path.join(import.meta.dirname, ".function-manifest-"));
  try {
    const output = path.join(temporary, "scriptc-functions");
    await mkdir(output);
    await writeFile(path.join(temporary, "BUILD_ID"), "current\n");
    await startFunctions(temporary, temporary); // No native functions in this build.
    await writeFile(path.join(output, "manifest.json"), "{");
    await assert.rejects(startFunctions(temporary, temporary), /Cannot read native functions manifest.*Rebuild/);
    await writeFile(path.join(output, "manifest.json"), JSON.stringify({ buildId: "stale" }));
    await assert.rejects(startFunctions(temporary, temporary), /build ID mismatch/);
    for (const processes of [null, {}, [], [null], [{ binary: "other" }],
      ...[undefined, "1234", 0, -1, 1.5, 65536].map((port) => [{ binary: "functions", port, routes: ["label"] }]),
      ...[undefined, "label", [], [null], [""]].map((routes) => [{ binary: "functions", port: 1234, routes }]),
    ]) {
      await writeFile(path.join(output, "manifest.json"), JSON.stringify({ buildId: "current", processes }));
      await assert.rejects(startFunctions(temporary, temporary), /Invalid native functions manifest.*Rebuild/);
    }
    await writeFile(path.join(output, "manifest.json"), JSON.stringify({ buildId: "current", processes: [{ binary: "functions", port: 1234, routes: ["arbitrary label"] }] }));
    await assert.rejects(startFunctions(temporary, temporary), /Missing or invalid native functions binary/);
    await writeFile(path.join(output, "functions"), "not executable", { mode: 0o644 });
    await assert.rejects(startFunctions(temporary, temporary), /Missing or invalid native functions binary/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});


test("sidecar warm-up is optional, bounded and does not block concurrent real calls", { timeout: 20000 }, async () => {
  const { callNative } = await import("../src/functions/client.mjs");
  const temporary = await mkdtemp(path.join(import.meta.dirname, ".warmup-"));
  const binary = path.join(temporary, "fixture.cjs");
  const children = [];
  try {
    await writeFile(binary, `#!${process.execPath}
const {createServer} = require('node:http');
let warmStarted = 0, warmDone = 0, warmSocket;
const server = createServer((req,res) => {
  if (req.url === '/__warmup') {
    warmStarted++;
    warmSocket = req.socket.remotePort;
    req.resume();
    req.on('end', () => setTimeout(() => { warmDone++; res.end('{"warmup":true,"args":[]}'); }, 2000));
  } else if (req.url === "/same-socket") res.end(JSON.stringify(req.socket.remotePort === warmSocket));
  else res.end(JSON.stringify({warmStarted,warmDone}));
});
server.listen(0,'127.0.0.1',()=>console.log('next-scriptc: listening on 127.0.0.1:'+server.address().port));
`);
    await chmod(binary, 0o755);
    const cold = createSidecar(binary, { warmup: false }); children.push(cold);
    const coldPort = await cold.port();
    await new Promise(r => setTimeout(r, 20));
    assert.deepEqual(await callNative(coldPort, "real", []), { warmStarted: 0, warmDone: 0 });
    const warm = createSidecar(binary, { warmup: true, warmupTimeout: 1000 }); children.push(warm);
    const port = await warm.port();
    let observation;
    const deadline = Date.now() + 1000;
    do {
      observation = await callNative(port, "real", []);
      if (!observation.warmStarted) await new Promise(r => setTimeout(r, 5));
    } while (!observation.warmStarted && Date.now() < deadline);
    assert.deepEqual(observation, { warmStarted: 1, warmDone: 0 }, "real RPC completes while warm-up is still pending");
    await new Promise(r => setTimeout(r, 1100));
    assert.deepEqual(await callNative(port, "real", []), { warmStarted: 1, warmDone: 0 }, "warm-up timeout is harmless to real RPCs");
    const quickBinary = path.join(temporary, "quick.cjs");
    await writeFile(quickBinary, (await readFile(binary, "utf8")).replace("2000", "1500"));
    await chmod(quickBinary, 0o755);
    const quick = createSidecar(quickBinary, { warmup: true }); children.push(quick);
    const quickPort = await quick.port();
    const pool = nativeAgent.getName({ host: "127.0.0.1", port: quickPort });
    // A platform hold can exceed one second before the warm response arrives.
    const reuseDeadline = Date.now() + 5000;
    while (!nativeAgent.freeSockets[pool]?.length && Date.now() < reuseDeadline) await new Promise(r => setTimeout(r, 5));
    assert.ok(nativeAgent.freeSockets[pool]?.length, "completed warm-up releases a keep-alive socket");
    assert.equal(await callNative(quickPort, "same-socket", []), true, "real client reuses the bootstrap's warmed connection");
  } finally {
    for (const child of children) child.stop();
    await rm(temporary, { recursive: true, force: true });
  }
});
