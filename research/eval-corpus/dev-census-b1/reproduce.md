# Reproduce B1

Use the frozen DEV manifest and EV3 server scopes. Do not select HELD_OUT entries
or Papermark. All source checkouts and package caches belong under `/tmp`.
Install workspace dependencies in this worktree with lifecycle scripts disabled.
The stock compiler setup script prepares its installed executable for native tests.

```sh
pnpm install --ignore-scripts --frozen-lockfile --store-dir /tmp/b1-pnpm-store
node node_modules/.pnpm/scriptc@0.4.6/node_modules/scriptc/scripts/install-native.mjs
mkdir -p /tmp/b1-tools /tmp/b1-verified-results
ln -s "$PWD/packages/scriptc-promote/node_modules" /tmp/b1-tools/node_modules
TMPDIR=/tmp DEV_CENSUS_OUTPUT=/tmp/b1-verified-results \
DEV_CENSUS_TEMP=/tmp/b1-verified-clones DEV_CENSUS_BATCH_MODE=1 \
python3 research/eval-corpus/dev-census/run.py
```

The runner checks for at least 12,000,000,000 free bytes before every application
install. It records disk skips and failed installs rather than inventing zero
coverage. It removes each clone after scanning. Every application install disables
lifecycle scripts. Offline Prisma generation runs with network access denied and
excludes custom generators or configuration. No application build or benchmark runs.

The final run also scans GrowthBook in a second serial worker with separate
`DEV_CENSUS_OUTPUT` and `DEV_CENSUS_TEMP` directories. Its completed result is
copied into the main output before that worker reaches GrowthBook. Never run more
than three installed clones. Do not copy partial results to skip unfinished work.

Copy completed per-repository JSON or gzip results into this directory. Preserve
failed-scan and install records. Then aggregate and compare against EV3:

```sh
DEV_CENSUS_OUTPUT=research/eval-corpus/dev-census-b1 \
node research/eval-corpus/dev-census/summarize.mjs
node research/eval-corpus/dev-census-b1/compare.mjs
TMPDIR=/tmp pnpm --dir packages/next-scriptc test
TMPDIR=/tmp pnpm --dir packages/scriptc-promote test
node scripts/compress-artifacts.mjs --check
node scripts/check-research-links.mjs
```

Existing repository results are skipped. Move a result aside before an intentional
retry. N8n and Unleash retain EV3's labeled compatible TypeScript hosts. Retain
implementation hashes, exact pins, scopes, process failures, and omissions.
Acceptance measures static discovery only. It does not establish native compiler
support, request reachability, or speed.

Large artifacts use deterministic level-9 gzip. Drop redundant process logs.
Remove task-owned temporary clones, tools, and package caches after all workers
finish. Never install dependencies in or link to the main checkout.
