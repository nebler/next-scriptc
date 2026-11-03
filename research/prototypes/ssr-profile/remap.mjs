// Remap bundled production frames before attribution. Never replace raw profiles.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { attribute } from "./attribute.mjs";
const [dependencyRoot, profilePath, outPath, resultPath] =
  process.argv.slice(2);
const require = createRequire(dependencyRoot + "/package.json");
const { TraceMap, originalPositionFor } = require("@jridgewell/trace-mapping");
const profile = JSON.parse(gunzipSync(readFileSync(profilePath)));
const cache = new Map();
let mapped = 0;
for (const n of profile.nodes) {
  const f = n.callFrame;
  let path = f.url;
  if (path.startsWith("file:")) path = fileURLToPath(path);
  if (!path.startsWith("/")) continue;
  const mapPath = path + ".map";
  if (!cache.has(mapPath))
    cache.set(
      mapPath,
      existsSync(mapPath)
        ? new TraceMap(JSON.parse(readFileSync(mapPath, "utf8")))
        : null,
    );
  const map = cache.get(mapPath);
  if (!map) continue;
  const pos = originalPositionFor(map, {
    line: f.lineNumber + 1,
    column: Math.max(0, f.columnNumber),
  });
  if (pos.source) {
    n.generatedCallFrame = f;
    n.callFrame = {
      ...f,
      url: pos.source,
      functionName: pos.name || f.functionName,
      lineNumber: pos.line - 1,
      columnNumber: pos.column,
    };
    mapped++;
  }
}
writeFileSync(
  outPath,
  JSON.stringify(
    {
      mappedNodes: mapped,
      totalNodes: profile.nodes.length,
      ...attribute(
        profile,
        resultPath
          ? JSON.parse(gunzipSync(readFileSync(resultPath))).profile.bounds
          : undefined,
      ),
    },
    null,
    2,
  ),
);
writeFileSync(outPath + ".profile.gz", gzipSync(JSON.stringify(profile)));
