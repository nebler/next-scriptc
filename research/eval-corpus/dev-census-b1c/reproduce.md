# Reproduce B1c

Run from this worktree. Install its dependencies with scripts disabled and a
`/tmp` pnpm store. Prepare the installed stock compiler with its native installer.
Never link to the main checkout. Before each application install the existing
runner requires 12,000,000,000 free bytes and records the actual free-byte count.
It removes each clone after scanning. This run uses one installed clone at a time.
Caches are reused between repositories, and removed after the run.

```sh
pnpm install --ignore-scripts --frozen-lockfile --store-dir /tmp/b1c-pnpm-store
node node_modules/.pnpm/scriptc@0.4.6/node_modules/scriptc/scripts/install-native.mjs
mkdir -p /tmp/b1-tools /tmp/b1c-results
cp research/eval-corpus/dev-census-b1c/scan-policy.json /tmp/b1c-results/scan-policy.json
ln -s "$PWD/packages/scriptc-promote/node_modules" /tmp/b1-tools/node_modules
TMPDIR=/tmp DEV_CENSUS_OUTPUT=/tmp/b1c-results DEV_CENSUS_TEMP=/tmp/b1c-clones \
DEV_CENSUS_BATCH_MODE=1 python3 research/eval-corpus/dev-census/run.py \
AFFiNE actual evidence grist-core growthbook n8n nocodb openpanel posthog umami unleash
```

Use the SHA-512 verified Bun 1.4.4 platform package from the EV3 tool lock,
extracted under `/tmp/b1-verified-bun/node_modules/@oven/bun-darwin-aarch64`.
The policy selects full report discovery plus fresh resolver evidence, avoiding a
second invocation of the same discovery implementation. Early batches in the
recorded run used paired EV1/EV2; every later batch records its mode explicitly.
Remove the policy file to repeat paired scans. Application installs disable lifecycle scripts. The compatible TypeScript hosts
for frozen n8n and Unleash pins apply independently of the output directory name.

To reproduce discovery before B1, export adapter source with
`git archive b9c7f56 packages/scriptc-promote/src`, extract under `/tmp`, and link
its package dependencies to this worktree's installed package dependencies.
Repeat with the starting B1 revision. No baseline installation is necessary.
Pass the extracted root as the runner argument:

```sh
node research/eval-corpus/dev-census-b1c/reproducers.mjs /tmp/b1c-before
node research/eval-corpus/dev-census-b1c/reproducers.mjs /tmp/b1c-b1
node research/eval-corpus/dev-census-b1c/reproducers.mjs
DEV_CENSUS_OUTPUT=research/eval-corpus/dev-census-b1c node research/eval-corpus/dev-census/summarize.mjs
node research/eval-corpus/dev-census-b1c/compare.mjs
TMPDIR=/tmp npm_config_cache=/tmp/b1c-test-npm-cache pnpm --dir packages/next-scriptc test
TMPDIR=/tmp npm_config_cache=/tmp/b1c-test-npm-cache pnpm --dir packages/scriptc-promote test
node scripts/compress-artifacts.mjs --check
node scripts/check-research-links.mjs
```

Copy per-repository results before aggregation. Preserve failed attempts during
retries. Large artifacts use deterministic level-9 gzip with zero MTIME and no
filename. Commit no application source or dependencies. Discovery acceptance does
not establish compiler acceptance, HTTP reachability, or speed.
