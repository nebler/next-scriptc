import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile, readFile, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { discoverRoutes, entrySource, routeRewrite, withRewrites } from "../src/routes.mjs";
import { writeNativeConfig } from "../src/native-config.mjs";
import { shimPath, nextServerPath } from "../src/paths.mjs";
import adapter from "../src/adapter.mjs";

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
    // Exercise aliases inherited from a base config, with no baseUrl, just as
    // Next resolves them. The fixture uses the demo's installed TS API.
    await mkdir(path.join(temporary, "node_modules"));
    await symlink(path.resolve(import.meta.dirname, "../../../examples/demo/node_modules/typescript"), path.join(temporary, "node_modules/typescript"));
    await symlink(path.resolve(import.meta.dirname, "../../../examples/demo/node_modules/@types"), path.join(temporary, "node_modules/@types"));
    await writeFile(path.join(temporary, "base.json"), JSON.stringify({ compilerOptions: { paths: { "@fixture/*": ["./helpers/*"] } } }));
    const originalConfig = JSON.stringify({ extends: "./base.json", compilerOptions: { strict: true, jsx: "react-jsx", allowImportingTsExtensions: true, noEmit: true } });
    await writeFile(path.join(temporary, "tsconfig.json"), originalConfig);
    await mkdir(path.join(temporary, "helpers"));
    await writeFile(path.join(temporary, "helpers/response.ts"), 'import { NextResponse } from "next/server"; export function json(value: unknown) { return NextResponse.json(value); }');
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
    await route("native/[slug]", "ts", '"use scriptc"; import { NextRequest } from "next/server"; import { json } from "@fixture/response"; export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) { const { slug } = await context.params; const response = json({ slug, path: request.nextUrl.pathname, cookie: request.cookies.get("a") }); response.cookies.set("a", "b"); return response; }');
    const nativeRoutes = await discoverRoutes(temporary, extensions);
    const output = path.join(temporary, "native");
    await mkdir(output);
    await writeNativeConfig(temporary, output, { experimental: {}, typescript: { tsconfigPath: "tsconfig.json" } });
    const nativeConfig = JSON.parse(await readFile(path.join(output, "tsconfig.json"), "utf8"));
    assert.deepEqual(nativeConfig.compilerOptions.paths, { "@fixture/*": [path.join(temporary, "helpers/*")], "next/server": [nextServerPath] });
    assert.equal(await readFile(path.join(temporary, "tsconfig.json"), "utf8"), originalConfig);
    const entry = path.join(output, "entry.ts");
    await writeFile(entry, `import { serve } from ${JSON.stringify(shimPath)};\n` + nativeRoutes.map((route, index) => entrySource(route, `r${index}`)).join(""));
    await promisify(execFile)(compiler, ["build", entry, "-o", path.join(temporary, "server"), "--no-keep-llvm"], { timeout: 90_000 });
    const unsupported = path.join(output, "unsupported.ts");
    await writeFile(unsupported, 'import { NextResponse } from "next/server"; console.log(NextResponse.next());');
    await assert.rejects(promisify(execFile)(compiler, ["build", unsupported, "-o", path.join(output, "unsupported"), "--no-keep-llvm"], { timeout: 30_000 }), (error) => {
      assert.match(error.stderr, /SC0001: Property 'next' does not exist/);
      return true;
    });
    await writeFile(unsupported, 'import { NextRequest } from "next/server"; new NextRequest("http://fixture.test").formData();');
    await assert.rejects(promisify(execFile)(compiler, ["build", unsupported, "-o", path.join(output, "unsupported"), "--no-keep-llvm"], { timeout: 30_000 }), (error) => {
      assert.match(error.stderr, /SC0001: This expression is not callable/);
      return true;
    });
    await route("unsupported", "mdx", '/* comment */\n"use scriptc"; export const GET = () => new Response("no");');
    await assert.rejects(discoverRoutes(temporary, [...extensions, "mdx"]), /Unsupported native route extension/);
    await rm(path.join(temporary, "app/unsupported"), { recursive: true });
    await route("star", "ts", '"use scriptc"; export * from "../ts/route.ts";');
    await assert.rejects(discoverRoutes(temporary, extensions), /Use named HTTP method exports/);
    console.log("Compiled all six route extensions and named function/variable/alias/re-exports; native-only next/server and inherited aliases; unsupported middleware helper rejected.");
  } finally { await rm(temporary, { recursive: true, force: true }); }
});


test("literal rewrite segments remain literal in external destination URLs", () => {
  const { prepareDestination } = require("next/dist/shared/lib/router/utils/prepare-destination.js");
  for (const segment of ["feed.xml", "a+b", "a:b", "a(b)", "a!b", "a$b", "a^b"]) {
    const rewrite = routeRewrite({ pattern: `/api/${segment}`, port: 20000 });
    const { parsedDestination } = prepareDestination({ destination: rewrite.destination, params: {}, query: {}, appendParamsToQuery: true });
    assert.equal(decodeURIComponent(parsedDestination.pathname), `/api/${segment}`);
    assert.equal(new URL(rewrite.destination).pathname.includes("\\"), false);
  }
  assert.equal(routeRewrite({ pattern: "/api/feed.xml", port: 20000 }).source, "/api/feed\\.xml");
});

test("build completion leaves prerendered handlers with Next and preserves user rewrites", async () => {
  const temporary = await mkdtemp(path.join(import.meta.dirname, ".prerender-"));
  try {
    const app = path.join(temporary, "app/feed.xml");
    const distDir = path.join(temporary, ".next");
    await mkdir(app, { recursive: true });
    await mkdir(distDir);
    await writeFile(path.join(app, "route.ts"), '"use scriptc"; export function GET() { return new Response("feed"); }');
    const config = { experimental: {}, typescript: { tsconfigPath: "tsconfig.json" } };
    const planned = await adapter.modifyConfig(config, { phase: "phase-production-build", projectDir: temporary });
    const rewrites = await planned.rewrites();
    const user = { source: "/old-feed", destination: "/feed.xml" };
    rewrites.beforeFiles.push(user);
    await writeFile(path.join(distDir, "routes-manifest.json"), JSON.stringify({ rewrites }));
    await adapter.onBuildComplete({ projectDir: temporary, distDir, buildId: "test", outputs: {
      appRoutes: [{ pathname: "/feed.xml" }],
      prerenders: [{ route: "/feed.xml", routeType: "route", response: "complete", compute: "static" }],
    } });
    const routing = JSON.parse(await readFile(path.join(distDir, "routes-manifest.json"), "utf8"));
    assert.deepEqual(routing.rewrites, { beforeFiles: [user], afterFiles: [], fallback: [] });
    const manifest = JSON.parse(await readFile(path.join(distDir, "scriptc/manifest.json"), "utf8"));
    assert.deepEqual(manifest.routes, []);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
