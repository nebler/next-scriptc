import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import path from "node:path";
import { discoverFunctions, extractFunctions } from "../src/functions/extract.mjs";
import loader from "../src/functions/loader.mjs";
import { serialize, serializeResult } from "../src/functions/json.ts";

const source = "/project/app/page.tsx";
const extract = (text) => extractFunctions(text, source);

test("extracts only the dependency closure; keeps types and source bodies", () => {
  const text = `import { connection } from "next/server";
import { data, type Row } from "./data.ts";
import { Suspense } from "react";
type Result = { sum: number };
const factor = 2;
function sum(rows: Row[]) { return rows.length * factor; }
async function report(count: number): Promise<Result> { "use scriptc"; return { sum: sum(data) + count }; }
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
  const module = extract(`"use scriptc"; function helper(x: number) { return x + 1; } export async function add(x: number) { return helper(x); } const echo = async (x: string) => { return x; }; export { echo as renamed };`);
  assert.deepEqual(module.functions.map((fn) => fn.name), ["add", "echo"]);
  assert.match(module.native, /function helper/);
  assert.equal(extract(`"use scriptc"; export type { Row } from "./types"; export async function f() { return 1; }`).functions.length, 1);
  assert.equal(extract(`"use scriptc"; export const named = async function inner(x: number) { return x; };`).functions[0].name, "named");
  assert.equal(extract(`async function plain() { return 1; }`), null);
});

test("rejects unsupported scopes, APIs and exports with the function name", () => {
  for (const [text, expected] of [
    ['export function bad() { "use scriptc"; return 1; }', /function bad: must be async/],
    ['"use scriptc"; export const bad = 1;', /function bad: all value exports/],
    ['"use scriptc"; export default async function bad() {}', /function <exports>/],
    ['"use scriptc"; export { f } from "./other";', /function <exports>/],
    ['"use client"; export async function bad() { "use scriptc"; }', /function bad:.*use client/],
    ['function Page() { const local = 1; async function bad() { "use scriptc"; return local; } }', /function bad:.*component-scope/],
    ['import { connection } from "next/server"; async function bad() { "use scriptc"; return connection(); }', /function bad: reference connection.*next\/server/],
    ['import { cache } from "react"; async function bad() { "use scriptc"; return cache(() => 1); }', /function bad: reference cache.*react/],
    ['function helper() { return process.env.KEY; } async function bad() { "use scriptc"; return helper(); }', /function bad: unsupported reference process/],
    ['async function bad() { "use scriptc"; return fetch("/"); }', /function bad: unsupported reference fetch/],
    ['async function bad() { "use scriptc"; return this; }', /function bad: unsupported reference this/],
    ['async function bad({x}: {x:number}) { "use scriptc"; return x; }', /function bad: parameters/],
    ['const values: number[] = []; values.push(1); async function bad() { "use scriptc"; return values; }', /function bad: unsupported module initialization/],
    ['let value = 1; value++; async function bad() { "use scriptc"; return value; }', /function bad: reference value is reassigned/],
  ]) assert.throws(() => extract(text), expected, text);
});

test("JSON boundary rejects lossy values instead of silently coercing them", () => {
  const value = { a: [1, null, "text", true], b: {} };
  assert.deepEqual(JSON.parse(serialize(value)), value);
  assert.equal(serializeResult(value), serialize(value));
  const shared = { n: 1 };
  assert.equal(serializeResult([shared, shared]), JSON.stringify([shared, shared]));
  const cyclic = {}; cyclic.self = cyclic;
  const hidden = Object.defineProperty({}, "x", { value: undefined });
  const getter = { get x() { return 1; } };
  const extra = [1]; extra.x = 2;
  const holeAndExtra = Array(1); holeAndExtra.extra = 1;
  for (const invalid of [holeAndExtra, undefined, NaN, Infinity, 1n, () => 1, Symbol(), new Date(), new Map(), { x: undefined }, [undefined], Array(2), cyclic, hidden, getter, extra, { [Symbol()]: 1 }]) {
    assert.throws(() => serialize(invalid), /JSON/);
    assert.throws(() => serializeResult(invalid), /JSON/);
  }
});

test("discovery supports inline route functions and rejects indirect Next/client imports through aliases", async () => {
  const temporary = await mkdtemp(path.join(import.meta.dirname, ".functions-"));
  try {
    await symlink(path.resolve(import.meta.dirname, "../../../examples/demo/node_modules"), path.join(temporary, "node_modules"));
    await mkdir(path.join(temporary, "app"));
    await mkdir(path.join(temporary, "lib"));
    await writeFile(path.join(temporary, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, paths: { "@lib/*": ["./lib/*"] }, moduleResolution: "bundler" } }));
    await writeFile(path.join(temporary, "app/route.ts"), 'import { helper } from "@lib/helper"; async function native() { "use scriptc"; return helper(); } export async function GET() { return Response.json(await native()); }');
    const helper = path.join(temporary, "lib/helper.ts");
    const config = { experimental: {}, typescript: { tsconfigPath: "tsconfig.json" } };
    for (const [text, error] of [
      ['import { connection } from "next/server"; export function helper() { return connection(); }', /function native: reference helper: unsupported import next\/server/],
      ['"use client"; export function helper() { return 1; }', /function native: reference helper: import of client module/],
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
    await writeFile(path.join(output, "manifest.json"), JSON.stringify({ buildId: "stale" }));
    await assert.rejects(startFunctions(temporary, temporary), /build ID mismatch/);
    await writeFile(path.join(output, "manifest.json"), JSON.stringify({ buildId: "current", processes: [{ binary: "functions", port: 1234, routes: ["arbitrary label"] }] }));
    await assert.rejects(startFunctions(temporary, temporary), /Missing or invalid native functions binary/);
    await writeFile(path.join(output, "functions"), "not executable", { mode: 0o644 });
    await assert.rejects(startFunctions(temporary, temporary), /Missing or invalid native functions binary/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
