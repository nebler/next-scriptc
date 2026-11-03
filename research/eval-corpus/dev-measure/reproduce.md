# Reproduce M1's DEV measurement

Run from this worktree. Use only worktree-local dependencies, stock scriptc 0.4.6,
and temporary application clones/tools/caches. Never link dependencies to another
checkout. The original cohort is B1's 251 accepted functions, not later discovery.

```sh
npm_config_cache=/tmp/m1-tool-npm-cache pnpm install --ignore-scripts --frozen-lockfile --store-dir /tmp/m1-workspace-store
node node_modules/.pnpm/scriptc@0.4.6/node_modules/scriptc/scripts/install-native.mjs
python3 research/eval-corpus/dev-measure/prepare-bun.py
DEV_MEASURE_OUTPUT=/tmp/m1-replay-native DEV_MEASURE_TEMP=/tmp/m1-replay-clones DEV_MEASURE_FINAL=1 python3 research/eval-corpus/dev-measure/run.py
```

`prepare-bun.py` verifies the platform tool against EV3's pinned sha512 integrity.
The runner imports EV3's install policy in memory: immutable DEV-only pins,
`--ignore-scripts`, serial installs, ≥12,000,000,000 free bytes before every
install, reused temporary caches, and clone removal after each repository. Keep
output outside the saved results when replaying. Existing results are skipped.
Non-Node controls need only pin verification, no Node dependency installation.
The final saved minimum install floor was 12,497,154,048 bytes.

`measure.py` selects accepted source files within B1's original TypeScript roots,
five files per report call. The file-scope preload filters enumeration only; it
retains tests/fixtures for input generation and dependencies for type resolution.
n8n and Unleash use EV3's TypeScript-host compatibility preload. This does not
repeat full discovery; B1's validator coverage gap stays unknown. B1's original
full-scope static route graph is carried into the joined output.

`input-gen.mjs` finds literal same-name test calls, following scoped constants,
`as const` and shorthand properties. String payloads are synthesized; lengths,
Unicode widths, JSON shape, numeric values and keys remain. `worker.mjs` restores
schema literal tags and source-checked formats using temporary raw fixtures.
Raw fixtures never belong in committed artifacts. Name matching is not full
import-symbol resolution; imported builders can be missed and domain correlations
can be lost. Fallback type synthesis uses 8/32/128 array/string sizes; scalar
numbers stay 32, so scalar-only tuples can repeat. Input source/provenance is
recorded per case. The integration self-check exercises actual stock compilation:

```sh
python3 research/eval-corpus/dev-measure/check-inputs.py
```

Two valid-input supplements override earlier unsuitable fixture/synthetic cases:
Grist `ACLPermissions.ts#isEmpty` uses type-generated permission objects rather
than unrelated same-name array fixtures, and n8n `parseVersionDir` uses own
v-prefixed decimal version components. Run the corresponding script through the
same pin/install/cleanup runner; only that repository should lack an output file:

```sh
DEV_MEASURE_OUTPUT=/tmp/m1-grist-probe DEV_MEASURE_TEMP=/tmp/m1-grist-clones DEV_MEASURE_SCAN_SCRIPT=research/eval-corpus/dev-measure/probe-grist.py python3 research/eval-corpus/dev-measure/run.py
DEV_MEASURE_OUTPUT=/tmp/m1-version-probe DEV_MEASURE_TEMP=/tmp/m1-version-clones DEV_MEASURE_SCAN_SCRIPT=research/eval-corpus/dev-measure/probe-version.py python3 research/eval-corpus/dev-measure/run.py
```

For a single-repository replay, populate other output entries from saved results
first (decompress gzip entries). Move only the target repository aside. The runner
creates its initial result before invoking the selected probe. Copy only the two
probe results into `supplements/valid-inputs/`. `probe-version.py` also runs its
JS-only baseline; it expects the current joined `functions.json` at the saved
artifact location, so regenerate or decompress that file first.

`hook.mjs` redirects only report's explicit measurement child. The frozen native
worker (`b234d910…`) uses unchanged stock `buildPromotion`, boundary encoding,
decoding and exact parity, 30 warmups, pilot JS batches, two cold pairs, 60
alternating **whole-process CPU** pairs and 2,000 seeded circular block resamples
(block five, seed one). Owner scheduling/encoding/decoding and native-worker CPU
are included. The first 24 pairs predict the unchanged lane policy offline. This
is not live dispatcher training on its selected thread clock. A separate
instrumented ten-call wall probe supplies boundary share; shared batch compile
and first-call wall costs are separate. The research worker remains frozen with
per-function native instances; the valid Grist supplement removes its affected
invalid inputs. Production report now isolates native instances per tuple.

The intensity screen requires independent JS **elapsed** measurements. First
join native results (the summarizer tolerates absent wall files), then run:

```sh
python3 research/eval-corpus/dev-measure/summarize.py
M1_WALL_ONLY=1 M1_BASELINE_FILE="$PWD/research/eval-corpus/dev-measure/functions.json" DEV_MEASURE_OUTPUT=/tmp/m1-replay-wall DEV_MEASURE_TEMP=/tmp/m1-wall-clones DEV_MEASURE_FINAL=1 python3 research/eval-corpus/dev-measure/run.py
```

`wall-worker.mjs` regenerates or replays exact saved native arguments, reviving
byte arrays. It uses 30 warmups and 21 retained elapsed/process-CPU batches, each
≥2 ms unless the 10-million-iteration cap is reached. Consume results and keep
serialization outside timing. Copy the 12 positive-function repository outputs
into `wall/`. The n8n valid-input supplement's `wallScans` override its earlier
case. `summarize.py` joins by function and identical serialized arguments;
`validate.py` checks every retained native case has a matching elapsed baseline.
Final input cases have no native ratio ≤0.90, so no winner-only deopt audit runs.
Any future winner needs the D1b JS-baseline audit before interpretation.

```sh
python3 research/eval-corpus/dev-measure/summarize.py
python3 research/eval-corpus/dev-measure/validate.py
npm_config_cache=/tmp/m1-test-npm-cache npm_config_ignore_scripts=true pnpm --config.verify-deps-before-run=false --dir packages/next-scriptc test
npm_config_cache=/tmp/m1-test-npm-cache npm_config_ignore_scripts=true pnpm --config.verify-deps-before-run=false --dir packages/scriptc-promote test
```

Charts use Python 3.9 and Matplotlib 3.9.4 installed only under `/tmp` (binary
wheels, no application lifecycle scripts). `plot-install.json` records setup.
Run `/usr/bin/python3 research/eval-corpus/dev-measure/chart.py` with dependencies
at `/tmp/m1-chart-libs`; it emits standalone PNG and self-contained HTML. This is
a scientific export, not an app or hosted site.

Stage the explicit artifact paths before compression; the compression utility
inspects tracked/staged research files. Then explicitly stage generated gzip
files. It round-trips each artifact with deterministic gzip headers:

```sh
node scripts/compress-artifacts.mjs
node scripts/compress-artifacts.mjs --check
node scripts/check-research-links.mjs
git diff --check
```

Keep failed/stale/pilot attempts separately. They are not aggregate observations.
`refresh-plan.py` records the original selective fingerprint refresh and should
not be used to overwrite a finished result. Remove only your own `/tmp` clones,
tools and caches after preserving output. No endpoint harness ran; endpoint CPU
remains null. No microbenchmark can satisfy the ≥5% endpoint gate by itself.
