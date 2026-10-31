import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { checkFunctionTypes } from "../src/functions/types.mjs";
import { discoverFunctions } from "../src/functions/extract.mjs";

const require = createRequire(new URL("../../../examples/demo/package.json", import.meta.url));
const ts = require("typescript");

test("JSON signature checker accepts data types and identifies rejected type paths", async () => {
  const directory = await mkdtemp(path.join(import.meta.dirname, ".function-types-"));
  try {
    const cases = [
      ["primitives", '(x: string | number | boolean | null): Promise<"ok" | 42 | false | null>', 'return null;'],
      ["containers", '(x: readonly [string, number | null, ...boolean[]]): Promise<ReadonlyArray<{ value: number }>>', 'return [];'],
      ["objects", '(x: Alias & { extra: string }): Promise<Face>', 'return { value: null };'],
      ["dictionary", '(x: Record<string, number | null>): Promise<{ [key: number]: boolean[] }>', 'return {};'],
      ["recursive", '(x: Tree): Promise<Tree>', 'return x;'],
      ["inferred", '(x: number)', 'return { value: x, rows: ["ok"], nullable: x ? 1 : null };'],
      ["badAny", '(x: any)', 'return 1;', /parameter x:.*any/],
      ["badUnknown", '(x: unknown)', 'return 1;', /parameter x:.*unknown/],
      ["badImplicit", '(x)', 'return 1;', /parameter x:.*any/],
      ["badNested", '(x: { rows: { amount: bigint }[] })', 'return 1;', /parameter x.rows\[\].amount:.*bigint/],
      ["badOptional", '(x: { value?: number })', 'return 1;', /parameter x.value: optional properties/],
      ["badOptionalParameter", '(x?: number)', 'return 1;', /parameter x: optional parameters/],
      ["badTuple", '(x: [string, number?])', 'return 1;', /parameter x\[1\]: optional tuple/],
      ["badUndefined", '(x: { value: number | undefined })', 'return 1;', /parameter x.value:.*undefined/],
      ["badVoid", '()', 'return;', /return:.*void/],
      ["badReturn", '(): Promise<unknown>', 'return 1;', /return:.*unknown/],
      ["badDate", '(x: Date)', 'return 1;', /parameter x\./],
      ["badMap", '(x: Map<string, number>)', 'return 1;', /parameter x\./],
      ["badSet", '(x: Set<number>)', 'return 1;', /parameter x\./],
      ["badClass", '(x: Data)', 'return 1;', /parameter x: class instances/],
      ["badFunction", '(x: { callback: () => number })', 'return 1;', /parameter x.callback: functions/],
      ["badIndex", '(x: { [key: string]: number | undefined })', 'return 1;', /parameter x\[string\]:.*undefined/],
      ["badSymbol", '(x: symbol)', 'return 1;', /parameter x:.*symbol/],
      ["badSymbolKey", '(x: { [key: symbol]: number })', 'return 1;', /parameter x\[symbol\]: symbol index/],
      ["badGetter", '(x: { get value(): number })', 'return 1;', /parameter x.value: accessors/],
      ["badGeneric", '<T extends string>(x: T)', 'return x;', /parameter x:.*generics/],
    ];
    const file = path.join(directory, "types.ts");
    await writeFile(file, `type Alias = { count: number }; interface Face { value: string | null }; type Tree = { value: number; children: Tree[] }; class Data { value = 1; }\n` + cases.map(([name, signature, body]) => `async function ${name}${signature} { ${body} }`).join("\n"));
    const program = ts.createProgram([file], { strict: true, target: ts.ScriptTarget.ESNext });
    const source = program.getSourceFile(file);
    for (const [name, , , error] of cases) {
      const node = source.statements.find((node) => node.name?.text === name);
      const check = () => checkFunctionTypes(ts, program, [{ source: file, functions: [{ name, start: node.body.getStart(source) }] }]);
      if (error) assert.throws(check, (err) => err.message.includes(`function ${name}:`) && error.test(err.message), name);
      else assert.doesNotThrow(check, name);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("discovery checks imported inferred types using extended project tsconfig", async () => {
  const directory = await mkdtemp(path.join(import.meta.dirname, ".function-types-"));
  try {
    await symlink(path.resolve(import.meta.dirname, "../../../examples/demo/node_modules"), path.join(directory, "node_modules"));
    await mkdir(path.join(directory, "lib"));
    await writeFile(path.join(directory, "base.json"), JSON.stringify({ compilerOptions: { strict: true, paths: { "@data/*": ["./lib/*"] }, moduleResolution: "bundler" } }));
    await writeFile(path.join(directory, "project.json"), '{"extends":"./base.json"}');
    await writeFile(path.join(directory, "lib/data.ts"), 'export interface Input { value: number | null }; export function helper() { return { rows: [{ invalid: undefined }] }; }');
    await writeFile(path.join(directory, "native.ts"), 'import { helper, type Input } from "@data/data"; export async function report(input: Input) { "use scriptc"; return helper(); }');
    const config = { typescript: { tsconfigPath: "project.json" } };
    await assert.rejects(discoverFunctions(directory, path.join(directory, ".next"), config), /function report: return.rows\[\].invalid:.*undefined/);
    await writeFile(path.join(directory, "lib/data.ts"), 'export interface Input { value: number | null }; export function helper() { return { rows: [{ valid: 1 }] }; }');
    assert.equal((await discoverFunctions(directory, path.join(directory, ".next"), config)).length, 1);
    await writeFile(path.join(directory, "native.ts"), 'export async function report(input: ReadonlyArray<Record<string, number | null>>): Promise<Readonly<{ rows: number[] }>> { "use scriptc"; return { rows: [] }; }');
    assert.equal((await discoverFunctions(directory, path.join(directory, ".next"), config)).length, 1, "standard JSON utility types survive extraction");
    await writeFile(path.join(directory, "base.json"), '{"compilerOptions":{"strictNullChecks":false}}');
    await assert.rejects(discoverFunctions(directory, path.join(directory, ".next"), config), /requires strictNullChecks/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
