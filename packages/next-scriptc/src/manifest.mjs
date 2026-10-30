import { readFile } from "node:fs/promises";
import path from "node:path";

export async function readManifest(distDir) {
  const file = path.join(distDir, "scriptc", "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(file, "utf8"));
  } catch (cause) {
    throw new Error(`[next-scriptc] Cannot read ${file}. Run next build successfully before starting.`, { cause });
  }
  if (manifest.version !== 1 || !Array.isArray(manifest.routes)) {
    throw new Error(`[next-scriptc] Invalid manifest: ${file}. Rebuild the application.`);
  }
  const buildId = (await readFile(path.join(distDir, "BUILD_ID"), "utf8")).trim();
  if (manifest.buildId !== buildId) {
    throw new Error(`[next-scriptc] Manifest does not match the Next build. Rebuild the application.`);
  }
  return manifest;
}
