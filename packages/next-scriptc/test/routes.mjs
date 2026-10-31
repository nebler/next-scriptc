import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile, readFile, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { discoverRoutes, entrySource, routeRewrite, withRewrites } from "../src/routes.mjs";
import { writeNativeConfig } from "../src/native-config.mjs";
import { shimPath, nextServerPath } from "../src/paths.mjs";
import adapter from "../src/adapter.mjs";
import { optionsKey, planRoutes, planProcesses } from "../src/options.mjs";
import { withScriptc } from "../src/index.ts";
import { readManifest } from "../src/manifest.mjs";

const require = createRequire(import.meta.url);
const compiler = path.resolve(path.dirname(require.resolve("scriptc/package.json")), require("scriptc/package.json").bin.scriptc);

test("route options validate keys, values, defaults, groups and process membership", async () => {
  const routes = ["/items/new", "/items/[id]", "/rest/[...slug]"].map((pattern, index) => ({ pattern, port: 20000 + index, binary: `route-${index}` }));
  for (const options of [null, [], { workers: true }, { routes: [] }, { routes: { "/items/new": null } },
    { routes: { "/items/new": { worker: true } } }, { routes: { "/items/new": { group: "" } } },
    { routes: { "/items/new": { group: 1 } } }, { routes: { "/items/new": { group: " light " } } },
    { routes: { "/items/new": { optimization: "fast" } } }, { routes: { "/items/new": { optimization: undefined } } }]) {
    assert.throws(() => withScriptc({}, options), /\[next-scriptc\]/);
  }
  for (const pattern of ["/missing", "/items/new/", "/(group)/items/new", "/items/42"]) {
    assert.throws(() => planRoutes(routes, { routes: { [pattern]: {} } }), /Unknown native route.*use scriptc/);
  }
  assert.throws(() => planRoutes(routes, { routes: {
    "/items/new": { group: "light", optimization: "speed" }, "/items/[id]": { group: "light" },
  } }), /conflicting optimization.*defaults to release/);
  const planned = planRoutes(routes, { routes: {
    "/items/[id]": { group: "light" }, "/items/new": { group: "light", optimization: "release" },
    "/rest/[...slug]": { optimization: "speed" },
  } });
  assert.equal(planned[0].port, planned[1].port);
  assert.deepEqual(planProcesses(planned).map(({ routes, optimization }) => ({ routes, optimization })), [
    { routes: ["/items/new", "/items/[id]"], optimization: "release" },
    { routes: ["/rest/[...slug]"], optimization: "speed" },
  ]);
  const config = { rewrites: async function () { assert.equal(this, config); return [{ source: "/old", destination: "/items/new" }]; } };
  const wrapped = withScriptc(config, { routes: { "/items/new": { optimization: "dev" } } });
  assert.deepEqual(await wrapped.rewrites(), [{ source: "/old", destination: "/items/new" }]);
  assert.equal(wrapped.rewrites[optionsKey].routes["/items/new"].optimization, "dev");
  assert.equal(config.rewrites[optionsKey], undefined, "original config callback is untouched");
});

test("grouped build drops prerenders, sorts static/dynamic/catch-all, and validates manifest", { timeout: 120_000 }, async () => {
  const temporary = await mkdtemp(path.join(import.meta.dirname, ".grouped-"));
  const children = [];
  try {
    const patterns = ["/items/[[...rest]]", "/items/[id]", "/items/new", "/aaa-static"];
    for (const pattern of patterns) {
      const app = path.join(temporary, "app", pattern);
      await mkdir(app, { recursive: true });
      await writeFile(path.join(app, "route.ts"), `"use scriptc"; export async function GET(request: Request, context: { params: Promise<Record<string, string | string[]>> }) { return Response.json({ route: ${JSON.stringify(pattern)}, params: await context.params, path: new URL(request.url).pathname }); }`);
    }
    const distDir = path.join(temporary, ".next");
    await mkdir(distDir);
    const rewrites = Object.assign(async () => [], { [optionsKey]: { routes: Object.fromEntries(patterns.map((pattern) => [pattern, { group: "fixture", optimization: "speed" }])) } });
    const config = { rewrites, experimental: {}, typescript: { tsconfigPath: "tsconfig.json" } };
    // A real Node route without the directive must not be configurable either.
    const nodeOnly = path.join(temporary, "app/node");
    await mkdir(nodeOnly);
    await writeFile(path.join(nodeOnly, "route.ts"), 'export function GET() { return new Response("node"); }');
    await assert.rejects(adapter.modifyConfig({ ...config, rewrites: Object.assign(async () => [], { [optionsKey]: { routes: { "/node": {} } } }) }, { phase: "phase-production-build", projectDir: temporary }), /Unknown native route/);
    const planned = await adapter.modifyConfig(config, { phase: "phase-production-build", projectDir: temporary });
    await writeFile(path.join(distDir, "routes-manifest.json"), JSON.stringify({ rewrites: await planned.rewrites() }));
    await adapter.onBuildComplete({ projectDir: temporary, distDir, buildId: "fixture", outputs: {
      appRoutes: patterns.map((pathname) => ({ pathname })),
      prerenders: [{ route: "/aaa-static", routeType: "route", response: "complete", compute: "static" }],
    } });
    await writeFile(path.join(distDir, "BUILD_ID"), "fixture");
    const manifest = await readManifest(distDir);
    assert.equal(manifest.processes.length, 1);
    assert.equal(manifest.routes.length, 3);
    assert.equal(manifest.processes[0].optimization, "speed");
    assert.deepEqual(manifest.processes[0].routes, ["/items/new", "/items/[id]", "/items/[[...rest]]"]);
    const responses = [];
    for (const native of [false, true]) {
      const child = spawn(native ? path.join(distDir, "scriptc", manifest.processes[0].binary) : process.execPath,
        native ? [] : ["--import", path.resolve(import.meta.dirname, "../shim/test/node-next-server.mjs"), path.join(distDir, "scriptc/entry-0.ts")],
        { env: { ...process.env, PORT: "0" }, stdio: ["ignore", "pipe", "pipe"] });
      const exited = new Promise((resolve) => child.once("close", resolve));
      children.push({ child, exited });
      let output = "";
      const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Grouped readiness timeout: ${output}`)), 30_000);
        child.once("error", reject);
        child.stderr.on("data", (chunk) => { output += chunk; });
        child.stdout.on("data", (chunk) => {
          output += chunk;
          const match = output.match(/listening on 127\.0\.0\.1:(\d+)/);
          if (match) { clearTimeout(timer); resolve(Number(match[1])); }
        });
        child.once("exit", () => { clearTimeout(timer); reject(new Error(output)); });
      });
      const result = [];
      for (const [pathname, pattern] of [["/items/new", "/items/new"], ["/items/a%20b", "/items/[id]"], ["/items/a/b", "/items/[[...rest]]"], ["/items", "/items/[[...rest]]"]]) {
        const response = await fetch(`http://127.0.0.1:${port}${pathname}`);
        const body = Buffer.from(await response.arrayBuffer());
        assert.equal(response.status, 200, output);
        assert.equal(JSON.parse(body).route, pattern);
        result.push(body);
      }
      responses.push(result);
      child.kill("SIGTERM");
      await exited;
    }
    assert.deepEqual(responses[1], responses[0], "every grouped route byte-equal to Node");
    const file = path.join(distDir, "scriptc/manifest.json");
    for (const corrupt of [
      { ...manifest, version: 1 }, { ...manifest, processes: [...manifest.processes, manifest.processes[0]] },
      { ...manifest, processes: [] }, { ...manifest, routes: [...manifest.routes, manifest.routes[0]] },
      { ...manifest, routes: manifest.routes.map((route, index) => index ? route : { ...route, optimization: "release" }) },
      { ...manifest, processes: manifest.processes.map((native) => ({ ...native, binary: "../outside" })) },
    ]) {
      await writeFile(file, JSON.stringify(corrupt));
      await assert.rejects(readManifest(distDir), /Invalid manifest/);
    }
  } finally {
    for (const { child } of children) child.kill("SIGKILL");
    await Promise.all(children.map(({ exited }) => exited));
    await rm(temporary, { recursive: true, force: true });
  }
});

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
