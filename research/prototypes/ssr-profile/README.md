# Profile React SSR CPU locally

This fixture measures full document requests and attributes main-thread CPU samples. Read [SPEC.md](SPEC.md) before extending it to another framework. The report is [../../ssr-cpu-breakdown-react.md](../../ssr-cpu-breakdown-react.md). The fixture does not use scriptc.

## Build the synthetic apps

Run from the repository root. Keep all dependencies and builds outside the checkout. These commands use an isolated npm cache and Node distribution. The pinned lockfile records transitive versions.

```sh
mkdir -p /tmp/nsc-ssr-r1/tools /tmp/nsc-ssr-r1/cache
npm install --prefix /tmp/nsc-ssr-r1/tools --cache /tmp/nsc-ssr-r1/cache node@24.22.0 --no-audit --no-fund
export PATH=/tmp/nsc-ssr-r1/tools/node_modules/node/bin:$PATH
export npm_config_cache=/tmp/nsc-ssr-r1/cache
export HARNESS="$PWD/research/prototypes/ssr-profile"
export OUT="$PWD/research/ssr-profile-react-results"
cp -R "$HARNESS" /tmp/nsc-ssr-r1/synthetic
cd /tmp/nsc-ssr-r1/synthetic
npm ci --cache /tmp/nsc-ssr-r1/cache --no-audit --no-fund
NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build next --webpack
cd router
../node_modules/.bin/react-router build
```

## Measure sequentially

Finish every install and build before timing. `run.mjs` starts and stops the server itself. It needs an entry file and arguments executable by Node, an IPC channel, and a loopback URL. Do not use a launcher that forks the measured server into another process. `PORT` and `NODE_ENV=production` are supplied automatically. Use a different output directory to preserve an existing run.

```sh
NODE_ENV=production node /tmp/nsc-ssr-r1/synthetic/ceiling.mjs "$OUT/ceiling.json"
VERIFY=1 node "$HARNESS/run.mjs" plain-string http://127.0.0.1:4100/string "$OUT" /tmp/nsc-ssr-r1/synthetic plain.mjs
VERIFY=1 node "$HARNESS/run.mjs" plain-stream http://127.0.0.1:4100/stream "$OUT" /tmp/nsc-ssr-r1/synthetic plain.mjs
VERIFY=1 node "$HARNESS/run.mjs" concat http://127.0.0.1:4100/concat "$OUT" /tmp/nsc-ssr-r1/synthetic plain.mjs
VERIFY=1 node "$HARNESS/run.mjs" next http://127.0.0.1:4101/ "$OUT" /tmp/nsc-ssr-r1/synthetic node_modules/next/dist/bin/next start next -p 4101
VERIFY=1 node "$HARNESS/run.mjs" router http://127.0.0.1:4102/ "$OUT" /tmp/nsc-ssr-r1/synthetic/router ../node_modules/@react-router/serve/bin.js build/server/index.js
```

`VERIFY=1` compares the complete main subtree with the concatenation result before timing. The plain string ceiling also asserts whole-output equality. The runner records all per-request latencies, status counts, response bytes, process CPU, profile samples, and top frames. JSON and profiles are gzip-compressed. `cpuMsPerRequest` is process user plus system CPU divided by responses; p50 and p95 are full-response client wall latency. The inspector profiler runs only during the separate profile block, excluding startup and warmup. CPU deltas include native threads; inspector samples describe the main JavaScript isolate.

## Prepare the real apps

No authentication, email, analytics endpoint, object store, or remote database is needed for these measured GET routes. Clone only under the task directory.

```sh
git clone https://github.com/epicweb-dev/epic-stack.git /tmp/nsc-ssr-r1/epic
git -C /tmp/nsc-ssr-r1/epic checkout 893610db76127fb5a5f1ffa786bee6b050637429
cd /tmp/nsc-ssr-r1/epic
npm ci --cache /tmp/nsc-ssr-r1/cache --legacy-peer-deps --no-audit --no-fund
export DATABASE_URL=file:/tmp/nsc-ssr-r1/epic/prisma/data.db
node node_modules/prisma/build/index.js migrate deploy
node node_modules/prisma/build/index.js generate --sql
node "$HARNESS/seed-epic.mjs"
node node_modules/@react-router/dev/bin.js build
```

Epic declares Node `^22.18.0`; npm warns on the required Node 24.22.0. This run used Node 24 anyway. Set the following local-only placeholders in your shell for Epic. They are not account credentials. The nonexistent loopback object-store endpoint is never used by the users document route; images are not fetched by the load generator. `PLAYWRIGHT_TEST_BASE_URL` raises the existing rate limits without source changes.

```sh
export DATABASE_PATH=/tmp/nsc-ssr-r1/epic/prisma/data.db
export CACHE_DATABASE_PATH=/tmp/nsc-ssr-r1/epic/prisma/cache.db
export LITEFS_DIR=/tmp/nsc-ssr-r1/epic/prisma
export SESSION_SECRET=local-benchmark-placeholder
export INTERNAL_COMMAND_TOKEN=local-benchmark-placeholder
export HONEYPOT_SECRET=local-benchmark-placeholder
export AWS_ACCESS_KEY_ID=unused AWS_SECRET_ACCESS_KEY=unused AWS_REGION=local
export AWS_ENDPOINT_URL_S3=http://127.0.0.1:4999 BUCKET_NAME=unused
export PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4104
EXPECT='Local Person' node "$HARNESS/run.mjs" epic-users http://127.0.0.1:4104/users "$OUT" /tmp/nsc-ssr-r1/epic index.ts

git clone https://github.com/timlrx/tailwind-nextjs-starter-blog.git /tmp/nsc-ssr-r1/blog
git -C /tmp/nsc-ssr-r1/blog checkout b45bef66b40c63b6f57c15ee8cd090682238df4c
cd /tmp/nsc-ssr-r1/blog
gzip -dc "$OUT/blog-install-lock.json.gz" > package-lock.json
npm ci --cache /tmp/nsc-ssr-r1/cache --legacy-peer-deps --ignore-scripts --no-audit --no-fund
node "$HARNESS/prepare-blog.mjs"
NEXT_TELEMETRY_DISABLED=1 INIT_CWD=$PWD node node_modules/next/dist/bin/next build
EXPECT='All Posts' node "$HARNESS/run.mjs" blog http://127.0.0.1:4105/blog/ "$OUT" /tmp/nsc-ssr-r1/blog node_modules/next/dist/bin/next start -p 4105
```

The blog repository uses Yarn; this experiment used npm to keep one cache. Its npm transitive install is not pinned by the upstream Yarn lockfile. Exact observed runtime versions and revisions are in `host.json`; the synthetic fixture has a committed npm lockfile. The blog patch forces dynamic rendering at the root and replaces the Google font variable with an empty value. It retains the bundled MDX content, layout, and components. Build only, without the upstream postbuild feed job. Check build output marks `/blog` dynamic.

## Attribute samples

Raw attribution uses script URL and function name. For bundled code, remap frames using the source maps from the exact installed build before deleting dependencies:

```sh
# Capture a fresh profile without repeating throughput blocks.
PROFILE_ONLY=1 VERIFY=1 node "$HARNESS/run.mjs" next-steady http://127.0.0.1:4101/ "$OUT" /tmp/nsc-ssr-r1/synthetic node_modules/next/dist/bin/next start next -p 4101
node "$HARNESS/remap.mjs" /tmp/nsc-ssr-r1/synthetic "$OUT/next-steady.cpuprofile.gz" "$OUT/next-attribution.json" "$OUT/next-steady.json.gz"
# Repeat for each target using the command above with PROFILE_ONLY=1 and a -steady label.
node "$HARNESS/summarize.mjs" "$OUT"
node "$HARNESS/attribute.mjs" "$OUT/plain-string.cpuprofile.gz"
```

`remap.mjs` resolves `@jridgewell/trace-mapping` from the installed synthetic dependencies. With the fourth argument, it clips sample intervals to the measured monotonic start and stop timestamps, excluding profiler startup and shutdown. Excluded microseconds are reported, and raw samples remain intact. It preserves generated frames in its compressed mapped profile. `attribute.mjs` is dependency-free. Its ordered rules classify self time, never inclusive stack time. Idle samples are retained separately. The report explains attribution uncertainty.

After saving results, stop all task servers, remove `/tmp/nsc-ssr-r1` including installs and cache, and run repository artifact and link checks. Do not retain third-party source in the repository.

Final category tables use the standalone `*-attribution.json` outputs and `summary.json`. Inline attribution in the first `*.json.gz` captures preserves the original broad URL classification. Original and fresh `*-steady` captures are both retained; only the latter supplies the report's category split.

Run `node --test "$HARNESS/test/attribute.test.mjs"` to check interval clipping and mapped package ownership.
