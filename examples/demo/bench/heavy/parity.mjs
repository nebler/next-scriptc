import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { edgeCases, sizes, spec, metadata, digest } from "./fixtures.mjs";
import { createClient } from "./client.mjs";
export async function parity(targets, client = createClient()) {
  const rows = [];
  const cases = [
    ...Object.entries(sizes).flatMap(([id, values]) =>
      values.map((size) => spec(id, size)),
    ),
    ...edgeCases(),
  ];
  for (const s of cases) {
    const results = [];
    for (const target of targets) {
      const pool = client.agent(target.url, 1);
      try {
        results.push({
          variant: target.variant,
          ...(await client.request(
            target.url,
            {
              ...s,
              path: s.path.replace(
                "/api/heavy/",
                target.prefix ?? "/api/heavy/",
              ),
            },
            pool,
          )),
        });
      } finally {
        pool.destroy();
      }
    }
    assert.ok(
      results.every((r) => r.digest === results[0].digest),
      `Three-way bytes: ${s.path}`,
    );
    rows.push({
      ...(s.size
        ? metadata(s)
        : {
            id: s.id,
            path: s.path,
            requestBytes: s.body.length,
            requestSha256: digest(s.body),
            status: s.status,
          }),
      results,
    });
  }
  return { status: "complete", cases: cases.length, rows };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const targets = JSON.parse(process.env.HEAVY_TARGETS);
  console.log(JSON.stringify(await parity(targets), null, 2));
}
