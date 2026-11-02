# Research index

Current usage lives in the [root README](../README.md). Reports below are dated
experiments with frozen source identities, protocols, raw artifacts and retained
failures. They are workload observations, not compatibility or production SLAs.

- [Vector search on Vercel](vector-vercel.md): int8 retrieval against Go SIMD,
  plain Go and Node, with stock/patched compiler controls and retained losses.
- [Int8 compiler patch](scriptc-int8-range-analysis.md): fork implementation,
  focused validation and pending full upstream validation.
- [Final Vercel benchmark](vercel-final.md): five deployment-first pairs, warm
  requests, process CPU/RSS, topology, sizes, recoveries and unavailable cells.
- [Realistic I/O](realistic-io.md): orders/webhooks, library refusals, hosted Redis
  and local emulated I/O.
- [Function-level native code](function-level.md): extraction, strict JSON
  contract, dashboard curves and lifecycle tests.
- [Go territory](go-territory.md): three-way CSV/JSON/thumbnail/bcrypt comparison.
- [Scouting summary](scouting-summary.md): Linux kernel candidates and losses;
  includes links to individual investigations.
- [Benchmark protocol/history](benchmarks.md), [adapter notes](adapter-notes.md),
  [compiler refusals](scriptc-refusals.md), [upstream issues](upstream-issues.md).

Earlier [Vercel feasibility](vercel-native-functions.md),
[smoke deployment](vercel-deploy-test.md), [integration](vercel-integration.md),
[startup/memory](vercel-cold-start-memory.md) and [grouping](round3-decisions.md)
records retain older implementations and measurements. Use their source commits
when reproducing historical behavior. [Next primitive](next-primitive.md) proposes
an upstream API; it is not the current adapter's API.

Raw files in `benchmarks/` are intentionally retained, including large request
traces, duplicate worker downloads, failed attempts, provenance and counter audits.
Do not replace a failed run with selected successful rows. Old controller paths
in frozen provenance resolve through the
[Vercel archive](../examples/demo/bench/vercel/archive/README.md); the original
source bytes also remain in the recorded Git commit. Report generators remain
alongside the active benchmark clients.

## Store large artifacts

Keep writers producing plain JSON, JSONL, NDJSON, text, or logs. After a run,
explicitly stage new or regenerated artifacts so Git tracks them, then run
`node scripts/compress-artifacts.mjs`. The script replaces tracked files larger
than 256 KiB with deterministic level-9 gzip files and stages removal of the
originals. Explicitly stage the resulting `.gz` files and update Markdown links.
Run `node scripts/compress-artifacts.mjs --check` to detect large uncompressed
tracked artifacts, and `node scripts/check-research-links.mjs` to check links.

Readers can use `readArtifact(path)` or `readJsonArtifact(path)` from
[lib/artifact.mjs](lib/artifact.mjs). Both accept file paths and file URLs,
prefer the requested path when it exists, and fall back to its plain or `.gz`
counterpart. `readArtifact` returns a Buffer by default, or text when given an
encoding. Existing readers can keep requesting plain paths after compression.
