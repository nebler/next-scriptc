# Measure the B1 DEV cohort

Run from this worktree with worktree-local dependencies and stock scriptc 0.4.6.
Application checkouts, stores, and generated build files stay under `/tmp`.

```sh
pnpm install --ignore-scripts --frozen-lockfile --store-dir /tmp/m1-workspace-store
node node_modules/.pnpm/scriptc@0.4.6/node_modules/scriptc/scripts/install-native.mjs
python3 research/eval-corpus/dev-measure/run.py
```

The runner imports the EV3 install policy in memory. It verifies each manifest pin,
requires 12,000,000,000 free bytes before every install, disables lifecycle scripts,
and removes each clone before the next repository. It never selects HELD_OUT entries.
Existing results are skipped. Move a result aside to retry it.

The B1 accepted source files retain their original TypeScript roots and dependency
resolution. This is a measurement of the recorded 251-function cohort, not another
full discovery census. The B1 validator coverage gap remains unknown. The file-scope
preload filters source enumeration only. Tests and fixtures remain available for
input review. The report retains route reachability only within the selected files;
B1's full-scope route graph is the broader static reference.

`hook.mjs` replaces only the report measurement child with `worker.mjs`, a research
variant of `report-measure.mjs`. It uses the same stock compiler, boundary encoder,
worker CPU clock, decoder, parity comparison, and lane policy. The research worker
uses 30 warmups, a JS pilot targeting 2 ms batches, 60 alternating CPU pairs, and
2,000 seeded circular block bootstrap resamples (block length five). It predicts
the dispatcher from the first 24 pairs independently of the longer protocol gate.
Boundary share remains the report's separate instrumented wall-time estimate.

Synthetic inputs resize type-generated arrays and strings to 8, 32, and 128.
Numbers remain 32 to avoid guessing scalar loop bounds. These sizes are diagnostic;
they establish neither representative traffic nor production frequency. Input
provenance and test-reference paths accompany results. No third-party source or
fixture contents belong in committed artifacts.

An endpoint CPU saving remains null without an endpoint harness. Unknown inputs,
compiler refusals, failed installs, and resource failures cannot count as CPU wins.
