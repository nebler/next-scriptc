import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { findDir } = require("next/dist/lib/find-pages-dir.js");
const { normalizeAppPath } = require("next/dist/shared/lib/router/utils/app-paths.js");
const { getSortedRoutes } = require("next/dist/shared/lib/router/utils/sorted-routes.js");

const methods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

export function entrySource(route, importName = "route", interceptionPatterns = []) {
  return `serve(${moduleSource(route, importName)}, { pattern: ${JSON.stringify(route.pattern)}${interceptionPatterns.length ? `, interceptionPatterns: ${JSON.stringify(interceptionPatterns)}` : ""} });\n`;
}

function moduleSource(route, importName) {
  return `async () => {\n` +
    `  const ${importName} = await import(${JSON.stringify(route.source)});\n` +
    `  return { ${methods.map((method) => `${method}: ${route.methods.includes(method) ? `${importName}.${method}` : "undefined"}`).join(", ")} };\n` +
    `}`;
}

export function processEntrySource(routes, interceptionPatterns = []) {
  if (routes.length === 1) return entrySource(routes[0], "route", interceptionPatterns);
  const sorted = new Map(routes.map((route) => [route.pattern, route]));
  return `serveMany([\n${getSortedRoutes([...sorted.keys()]).map((pattern, index) =>
    `  { pattern: ${JSON.stringify(pattern)}, module: ${moduleSource(sorted.get(pattern), `route${index}`)} }`
  ).join(",\n")}\n], { interceptionPatterns: ${JSON.stringify(interceptionPatterns)} });\n`;
}

export async function discoverRoutes(projectDir, pageExtensions = ["tsx", "ts", "jsx", "js", "native.ts"]) {
  const appDir = findDir(projectDir, "app");
  const routes = new Map();
  const { parse } = require("next/dist/compiled/babel/bundle.js").parser();

  async function visit(directory, isApp, enabled = isApp) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const source = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(source, isApp, enabled && !entry.name.startsWith("_"));
      } else if (entry.isFile()) {
        const native = entry.name === "route.native.ts";
        if (entry.name.includes(".native.") && (!native || !isApp)) {
          throw new Error(`[next-scriptc] Unsupported native file ${source}. Only App Router route.native.ts files can be native.`);
        }
        if (!enabled || !entry.name.startsWith("route.")) continue;
        const extension = entry.name.slice(6);
        if (native) {
          if (!pageExtensions.includes(extension)) throw new Error(`[next-scriptc] ${source} requires native.ts in Next's pageExtensions. Use withScriptc(config).`);
          const conflict = entries.find((other) => other.isFile() && other.name !== entry.name && pageExtensions.some((ext) => other.name === `route.${ext}`));
          if (conflict) throw new Error(`[next-scriptc] Conflicting route files: ${path.join(directory, conflict.name)} and ${source}. Keep only one route file per folder.`);
        }
        if (!native && !["ts", "js", "mts", "mjs", "tsx", "jsx"].includes(extension)) continue;
        const ast = parse(await readFile(source, "utf8"), { sourceType: "module", plugins: ["typescript", ...(extension.endsWith("x") ? ["jsx"] : [])] });
        if (ast.program.directives[0]?.value.value === "use scriptc") {
          throw new Error(`[next-scriptc] Route-level "use scriptc" is no longer supported in ${source}. Rename the file to route.native.ts and remove the directive.`);
        }
        if (!native) continue;
        const exported = new Set();
        for (const node of ast.program.body) {
          if (node.type === "ExportAllDeclaration") throw new Error(`[next-scriptc] Use named HTTP method exports instead of export * in ${source}.`);
          if (node.type !== "ExportNamedDeclaration" || node.exportKind === "type") continue;
          if (node.declaration?.id) exported.add(node.declaration.id.name);
          for (const declaration of node.declaration?.declarations ?? []) {
            if (declaration.id.type !== "Identifier") throw new Error(`[next-scriptc] Use named declarations for route exports in ${source}.`);
            exported.add(declaration.id.name);
          }
          for (const specifier of node.specifiers) {
            if (specifier.exportKind !== "type") exported.add(specifier.exported.name ?? specifier.exported.value);
          }
        }
        const pattern = normalizeAppPath(`/${path.relative(appDir, source).replaceAll(path.sep, "/").slice(0, -(extension.length + 1))}`).replace(/%5F/g, "_");
        if (routes.has(pattern)) throw new Error(`[next-scriptc] Duplicate route ${pattern}: ${source}`);
        routes.set(pattern, { source, methods: methods.filter((method) => exported.has(method)) });
      }
    }
  }

  if (appDir) await visit(appDir, true);
  const pagesDir = findDir(projectDir, "pages");
  if (pagesDir) await visit(pagesDir, false);
  const basePort = 20000 + (createHash("sha256").update(projectDir).digest().readUInt16BE(0) % 20000);
  return getSortedRoutes([...routes.keys()]).map((pattern, index) => ({
    pattern,
    ...routes.get(pattern),
    port: basePort + index,
    binary: `route-${index}`,
  }));
}

export function routeRewrite({ pattern, port }) {
  // Use generated parameter names: Next's segment names need not be valid rewrite names.
  const segments = pattern.split("/").map((segment, index) => {
    let parameter;
    if (/^\[\[\.\.\..+\]\]$/.test(segment)) parameter = `:sc${index}*`;
    else if (/^\[\.\.\..+\]$/.test(segment)) parameter = `:sc${index}+`;
    else if (/^\[.+\]$/.test(segment)) parameter = `:sc${index}`;
    if (parameter) return { source: parameter, destination: parameter };
    return {
      source: segment.replace(/[.*+?^${}()|[\]\\:]/g, "\\$&"),
      // Pattern escapes are not URL escapes: a backslash becomes a slash when
      // Next parses an external destination (for example feed\\.xml).
      destination: encodeURIComponent(segment).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`),
    };
  });
  return {
    source: segments.map((segment) => segment.source).join("/"),
    destination: `http://127.0.0.1:${port}${segments.map((segment) => segment.destination).join("/")}`,
  };
}

export function withRewrites(config, routes) {
  const original = config.rewrites;
  return {
    ...config,
    async rewrites() {
      const user = await original?.call(config) ?? [];
      const rewrites = Array.isArray(user)
        ? { beforeFiles: [], afterFiles: user, fallback: [] }
        : user;
      return {
        ...rewrites,
        beforeFiles: [...routes.filter((route) => !route.pattern.includes("[")).map(routeRewrite), ...(rewrites.beforeFiles ?? [])],
        afterFiles: [...routes.filter((route) => route.pattern.includes("[")).map(routeRewrite), ...(rewrites.afterFiles ?? [])],
      };
    },
  };
}
