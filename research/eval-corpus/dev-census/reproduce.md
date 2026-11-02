# Reproduce the DEV census

Run from a disposable worktree on the recorded macOS arm64 host. Keep the manifest unchanged. The runner allowlists DEV repositories, records non-Node controls, verifies pins, checks 15 GB before installs, disables lifecycle scripts, and removes each checkout after its scan. Use a serial runner, or at most three installed checkouts across concurrent runners.

Use empty task directories and do not replace an existing worktree dependency directory. Set `TMPDIR=/tmp` and direct every package-manager cache into the task directory. Ensure package-manager shims use existing compatible Node runtimes rather than installing user-global runtimes.

## Install locked analysis tools

Create `/tmp/nsc-dev-tools/package.json` with the dependencies from `tool-lock.json`'s `packages[""]` entry. Copy that lockfile to `/tmp/nsc-dev-tools/package-lock.json`, then run:

```sh
TMPDIR=/tmp npm ci --prefix /tmp/nsc-dev-tools --cache /tmp/nsc-dev-cache --ignore-scripts --no-audit --no-fund
```

Temporarily link this worktree's `packages/scriptc-promote/node_modules` to `/tmp/nsc-dev-tools/node_modules`, only when absent. Never link to the main checkout. For OpenPanel, repeat the locked tool installation using `bun-tool-lock.json` in `/tmp/nsc-dev-bun`. The recorded executable is `/tmp/nsc-dev-bun/node_modules/@oven/bun-darwin-aarch64/bin/bun` (Bun 1.4.4). No application build or native compiler invocation is required.

## Run scans and compatible-host retries

Existing per-repository results are skipped. Archive the specific per-repository result before an intentional rerun. Keep earlier archives under distinct names. A result placed at `attempts/resume-<slug>.json.gz` lets the batch scanner retain completed files and retry only missing ones.

```sh
TMPDIR=/tmp DEV_CENSUS_BATCH_MODE=1 \
DEV_CENSUS_BUN_BINARY=/tmp/nsc-dev-bun/node_modules/@oven/bun-darwin-aarch64/bin/bun \
python3 research/eval-corpus/dev-census/run.py
```

After archiving their canonical failures into the expected resume paths, retry the TypeScript 7 host cases explicitly:

```sh
TMPDIR=/tmp DEV_CENSUS_BATCH_MODE=1 DEV_CENSUS_ROOT_TYPESCRIPT=1 \
python3 research/eval-corpus/dev-census/run.py n8n

TMPDIR=/tmp DEV_CENSUS_BATCH_MODE=1 DEV_CENSUS_ROOT_TYPESCRIPT=1 \
DEV_CENSUS_TYPESCRIPT_HOST_DIRECTORY=/tmp/nsc-dev-tools \
DEV_CENSUS_TYPESCRIPT_HOST_REASON='Protocol TypeScript 5.9.3 host; canonical TypeScript 7 failures retained' \
python3 research/eval-corpus/dev-census/run.py unleash
```

N8n uses its installed root TypeScript 6.0.2 API. Unleash uses the protocol TypeScript 5.9.3 API. These are measurement-only overrides; they do not repair the canonical CLI's TypeScript 7 integration.

The GrowthBook memory retry uses `DEV_CENSUS_BATCH_FILES=32` and `DEV_CENSUS_NODE_HEAP_MIB=12288`. The remaining 32 validator files still fail. The final diagnostic attempt additionally uses `DEV_CENSUS_EV1_ONLY=1 DEV_CENSUS_SKIP_ENVIRONMENT=1`, and also fails. Keep those files unknown. Source enumeration filters preserve original paths and TypeScript resolution; exact selections and subprocess arguments are retained per scan.

## Aggregate and verify

```sh
node research/eval-corpus/dev-census/summarize.mjs
node research/eval-corpus/dev-census/write-report.mjs
node research/eval-corpus/dev-census/make-chart.mjs
node research/eval-corpus/dev-census/audit.mjs
```

The summary uses unique repository/file/function identities and one first diagnostic per function. The audit verifies DEV pins, diagnostic partitions, successful EV1/EV2 acceptance pairs, gzip headers, sizes, and secret patterns. The baseline comparison has different scopes and message/function units; do not interpret it as a causal improvement estimate.

Remove temporary worktree dependency links, task tools, and caches after all subprocesses exit. The runner cleans clones automatically. Preserve only metadata, results, pinned links, and our code. Files above 256 KiB use deterministic gzip, level 9, MTIME zero. The committed `cleanup.json` records the completed cleanup and the original run's early location-rule exceptions.
