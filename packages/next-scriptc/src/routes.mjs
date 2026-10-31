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
  return `import * as ${importName} from ${JSON.stringify(route.source)};\n` +
    `serve({ ${methods.map((method) => `${method}: ${route.methods.includes(method) ? `${importName}.${method}` : "undefined"}`).join(", ")} }, { pattern: ${JSON.stringify(route.pattern)}${interceptionPatterns.length ? `, interceptionPatterns: ${JSON.stringify(interceptionPatterns)}` : ""} });\n`;
}

export async function discoverRoutes(projectDir, pageExtensions = ["tsx", "ts", "jsx", "js"]) {
  const appDir = findDir(projectDir, "app");
  if (!appDir) return [];
  const routes = new Map();
  const { parse } = require("next/dist/compiled/babel/bundle.js").parser();

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const source = path.join(directory, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith("_")) {
        await visit(source);
      } else if (entry.isFile() && entry.name.startsWith("route.")) {
        const text = await readFile(source, "utf8");
        const extension = entry.name.slice(6);
        const supported = ["ts", "js", "mts", "mjs", "tsx", "jsx"].includes(extension);
        if (!supported) {
          if (/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*(["'])use scriptc\1/.test(text)) throw new Error(`[next-scriptc] Unsupported native route extension: ${source}`);
          continue;
        }
        const ast = parse(text, { sourceType: "module", plugins: ["typescript", ...(extension.endsWith("x") ? ["jsx"] : [])] });
        if (ast.program.directives[0]?.value.value !== "use scriptc") continue;
        if (!pageExtensions.includes(extension)) throw new Error(`[next-scriptc] ${source} has "use scriptc" but .${extension} is not enabled in Next's pageExtensions.`);
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

  await visit(appDir);
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
