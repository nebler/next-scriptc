// Run from a fresh blog clone at the revision pinned in host.json.
import { readFileSync, writeFileSync } from "node:fs";
const p = "app/layout.tsx";
let s = readFileSync(p, "utf8");
s = s.replace("import { Space_Grotesk } from 'next/font/google'\n", "");
const a = s.indexOf("const space_grotesk ="),
  b = s.indexOf("\n\n", a);
if (a < 0 || b < 0) throw Error("Unexpected source");
s =
  s.slice(0, a) +
  "const space_grotesk = { variable: '' }\nexport const dynamic = 'force-dynamic'\nexport const revalidate = 0" +
  s.slice(b);
writeFileSync(p, s);
const c = "next.config.js";
s = readFileSync(c, "utf8").replace(
  "    output,",
  "    output,\n    experimental: { cpus: 2 },",
);
writeFileSync(c, s);
