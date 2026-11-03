import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
export function category(frame, generated) {
  const u = (frame.url || "") + " " + (generated?.url || ""),
    n = frame.functionName || "";
  if (n === "(idle)") return "idle";
  if (n === "(garbage collector)") return "gc";
  if (/react-server-dom|react-server.*webpack|react-server.*turbopack/.test(u))
    return "flight";
  if (/react-dom.*server|react-dom-server/.test(u)) return "html";
  if (/devalue|nuxt.*(?:payload|serialize)|svelte.*serialize|astro.*runtime\/server\/serialize/.test(u)) return "serialization";
  if (/astro\/(?:dist|src)\/runtime\/server|svelte\/(?:src|internal)\/.*server|@vue\/server-renderer|vue\/server-renderer/.test(u)) return "html";
  if (/svelte\/src\/escaping\.js/.test(u)) return "html";
  if (/@vue\/shared/.test(u) && /escapeHtml|ssr/.test(n)) return "html";
  if (/JSON|serialize|devalue|stringify|turbo-stream/.test(n + " " + u))
    return "serialization";
  if (/prisma|sqlite|query_engine|pg-protocol|pg\/|postgres/.test(u))
    return "data";
  if (
    /^(writev|writeBuffer|writeUtf8String|encodeInto|encodeUtf8String|decodeUTF8|indexOfBuffer)$/.test(
      n,
    )
  )
    return "http";
  if (
    /node:.*(http|stream|net|tls|buffer|zlib|encoding)|node:internal\/webstreams/.test(
      u,
    )
  )
    return "http";
  if (/\.astro$|\.svelte$|\.vue$|\/chunks\/pages\//.test(frame.url || "")) return "html";
  // Mapped package ownership wins over the generated build/server location.
  if (/node_modules\/(?:@sveltejs|svelte|@vue|vue|@nuxt|nuxt|nitropack|h3|astro)\//.test(frame.url || "")) return "routing";
  if (/node_modules\/(?:dayjs|date-fns|tailwind-variants|@internationalized\/date)\//.test(u)) return "application";
  if (/\/shared\/|\/app\/|\/build\/server\/|\/\.next\/server\//.test(u))
    return "application";
  if (
    /next\/(dist|src)|react-router|express|router\/|node_modules\/react\//.test(
      u,
    )
  )
    return "routing";
  if (/astro\/|sveltejs|svelte\/|nuxt|nitro|h3\/|vue\/|@vue\//.test(u)) return "routing";
  return "other";
}
export function attribute(p, bounds) {
  const nodes = new Map(p.nodes.map((n) => [n.id, n]));
  const totals = {
    html: 0,
    flight: 0,
    application: 0,
    serialization: 0,
    data: 0,
    routing: 0,
    http: 0,
    gc: 0,
    other: 0,
    idle: 0,
  };
  const frames = {};
  let cursor = p.startTime,
    excludedUs = 0;
  for (let i = 0; i < p.samples.length; i++) {
    const node = nodes.get(p.samples[i]);
    const f = node.callFrame;
    const delta = p.timeDeltas[i];
    const next = cursor + delta;
    const us = bounds
      ? Math.max(
          0,
          Math.min(next, bounds.stopUs) - Math.max(cursor, bounds.startUs),
        )
      : delta;
    cursor = next;
    excludedUs += delta - us;
    const c = category(f, node.generatedCallFrame);
    totals[c] += us;
    const k = JSON.stringify({ frame: f, category: c });
    frames[k] = (frames[k] || 0) + us;
  }
  const activeUs = Object.entries(totals)
    .filter(([c]) => c !== "idle")
    .reduce((a, [, v]) => a + v, 0);
  return {
    bounds,
    excludedUs,
    totalsUs: totals,
    activeUs,
    percent: Object.fromEntries(
      Object.entries(totals)
        .filter(([c]) => c !== "idle")
        .map(([c, v]) => [c, (100 * v) / activeUs]),
    ),
    topFrames: Object.entries(frames)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 80)
      .map(([f, us]) => ({ ...JSON.parse(f), us })),
  };
}
if (process.argv[1]?.endsWith("/attribute.mjs")) {
  let b = readFileSync(process.argv[2]);
  if (process.argv[2].endsWith(".gz")) b = gunzipSync(b);
  const out = JSON.stringify(attribute(JSON.parse(b)), null, 2);
  if (process.argv[3]) writeFileSync(process.argv[3], out);
  else console.log(out);
}
