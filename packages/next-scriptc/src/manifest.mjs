import { readFile } from "node:fs/promises";
import path from "node:path";
import { optimizationModes } from "./options.mjs";

function validManifest(manifest) {
  if (manifest?.version !== 2 || !Array.isArray(manifest.routes) || !Array.isArray(manifest.processes)) return false;
  const ids = new Set();
  const ports = new Set();
  const binaries = new Set();
  const groups = new Set();
  const members = new Map();
  for (const native of manifest.processes) {
    if (!native || typeof native.id !== "string" || ids.has(native.id) ||
        typeof native.binary !== "string" || !/^route-\d+$/.test(native.binary) || binaries.has(native.binary) ||
        !Number.isInteger(native.port) || native.port < 1 || native.port > 65535 || ports.has(native.port) ||
        !optimizationModes.includes(native.optimization) || !Array.isArray(native.routes) || !native.routes.length ||
        (native.group !== undefined && (typeof native.group !== "string" || !native.group.trim() || native.group !== native.group.trim() || groups.has(native.group)))) return false;
    ids.add(native.id);
    ports.add(native.port);
    binaries.add(native.binary);
    if (native.group !== undefined) groups.add(native.group);
    if (native.group === undefined && native.routes.length !== 1) return false;
    for (const pattern of native.routes) {
      if (typeof pattern !== "string" || !pattern.startsWith("/") || members.has(pattern)) return false;
      members.set(pattern, native);
    }
  }
  for (const route of manifest.routes) {
    const native = members.get(route?.pattern);
    if (!native || route.process !== native.id || route.port !== native.port || route.binary !== native.binary ||
        route.optimization !== native.optimization || route.group !== native.group) return false;
    members.delete(route.pattern);
  }
  return members.size === 0;
}

export async function readManifest(distDir) {
  const file = path.join(distDir, "scriptc", "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(file, "utf8"));
  } catch (cause) {
    throw new Error(`[next-scriptc] Cannot read ${file}. Run next build successfully before starting.`, { cause });
  }
  if (!validManifest(manifest)) {
    throw new Error(`[next-scriptc] Invalid manifest: ${file}. Rebuild the application.`);
  }
  const buildId = (await readFile(path.join(distDir, "BUILD_ID"), "utf8")).trim();
  if (manifest.buildId !== buildId) {
    throw new Error(`[next-scriptc] Manifest does not match the Next build. Rebuild the application.`);
  }
  return manifest;
}
