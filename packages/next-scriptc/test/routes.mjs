import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { discoverRoutes, methods, withRewrites } from "../src/routes.mjs";
import { shimPath } from "../src/paths.mjs";

const require = createRequire(import.meta.url);
const compiler = path.resolve(path.dirname(require.resolve("scriptc/package.json")), require("scriptc/package.json").bin.scriptc);

test("discovery exports, Next extensions, rewrite phases, and typed native entries", { timeout: 120_000 }, async () => {
  const temporary = await mkdtemp(path.join(import.meta.dirname, ".routes-"));
  async function route(name, extension, content) {
    const directory = path.join(temporary, "app", name);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `route.${extension}`), content);
  }
  try {
    await writeFile(path.join(temporary, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, jsx: "react-jsx", allowImportingTsExtensions: true, noEmit: true } }));
    const extensions = ["ts", "js", "mts", "mjs", "tsx", "jsx"];
    for (const extension of extensions) await route(extension, extension, `"use scriptc"; export function GET() { return new Response("${extension}"); }`);
    await assert.rejects(discoverRoutes(temporary), /not enabled in Next's pageExtensions/);
    await route("items/[id]", "ts", '"use scriptc"; const handler = () => new Response("item"); export { handler as POST };');
    await route("items/new", "js", 'export function GET() { return new Response("node"); }');
    await route("rest/[...slug]", "ts", '"use scriptc"; export const GET = () => new Response("rest");');
    await route("optional/[[...slug]]", "ts", '"use scriptc"; export { GET } from "../../ts/route.ts";');
    const routes = await discoverRoutes(temporary, extensions);
    assert.equal(routes.length, 9);
    assert.deepEqual(routes.find((route) => route.pattern === "/items/[id]").methods, ["POST"]);
    const rewrites = await withRewrites({ rewrites: async () => [{ source: "/old", destination: "/new" }] }, routes).rewrites();
    assert.equal(rewrites.beforeFiles.length, 6);
    assert.equal(rewrites.afterFiles.length, 4);
    assert.equal(rewrites.afterFiles[0].source, "/items/:sc2");
    assert.equal(rewrites.afterFiles[1].source, "/optional/:sc2*");
    assert.equal(rewrites.afterFiles[2].source, "/rest/:sc2+");
    assert.equal(rewrites.afterFiles[3].source, "/old");
    const entry = path.join(temporary, "entry.ts");
    await writeFile(entry, [`import { serve } from ${JSON.stringify(shimPath)};`, ...routes.flatMap((route, index) => [
      `import * as r${index} from ${JSON.stringify(route.source)};`,
      `serve({ ${methods.map((method) => `${method}: ${route.methods.includes(method) ? `r${index}.${method}` : "undefined"}`).join(", ")} }, { pattern: ${JSON.stringify(route.pattern)}, port: 0 });`,
    ])].join("\n"));
    await promisify(execFile)(compiler, ["build", entry, "-o", path.join(temporary, "server"), "--no-keep-llvm"], { timeout: 90_000 });
    await route("unsupported", "mdx", '/* comment */\n"use scriptc"; export const GET = () => new Response("no");');
    await assert.rejects(discoverRoutes(temporary, [...extensions, "mdx"]), /Unsupported native route extension/);
    await rm(path.join(temporary, "app/unsupported"), { recursive: true });
    await route("star", "ts", '"use scriptc"; export * from "../ts/route.ts";');
    await assert.rejects(discoverRoutes(temporary, extensions), /Use named HTTP method exports/);
    console.log("Compiled all six route extensions and named function/variable/alias/re-exports.");
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
