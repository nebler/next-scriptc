# iad1 near-client benchmark

This is a small Node 24 Build Output API preview Function, deployed to the existing `next-scriptc` project. It uses pinned Undici HTTP/1.1 Agents with keep-alive, one connection per origin for C=1 and four for C=4, no RetryAgent, no application retries and no redirects. Origin pools persist for the lifetime of the client instance; variants on the same deployment share a pool. C=4 uses a separate pool from C=1.

Run from the repository root with an authenticated Vercel CLI and Node 24:

```sh
node examples/demo/bench/vercel/near-client/measure.mjs inspect
NEAR_PROJECT_FILE=/path/to/main-checkout/.vercel/project.json node examples/demo/bench/vercel/near-client/deploy.mjs
NEAR_ENV_FILE=/path/to/main-checkout/.env.local node examples/demo/bench/vercel/near-client/measure.mjs run
node examples/demo/bench/vercel/near-client/summarize.mjs
```

The defaults are `.vercel/project.json`, `.env.local` and `research/vercel-near-client`. Set `NEAR_OUTPUT` for a separate measurement output directory, and pass that directory as the deploy script's first argument too. Copy the intended deployment identity there when reusing a client. Deploy and measure refuse to overwrite their deployment/run records. Never pass the bypass in command arguments or URL query parameters. Only its environment-file path is passed here.

`deploy.mjs` creates a temporary directory, copies only the project link, source and pinned dependency manifest/lock, runs the allowlist/load tests, writes a single iad1 Function and deploys it with `--prebuilt --environment preview`. It deletes that temporary tree on exit. It changes no project settings and does not copy private environment files into the deployment.

`measure.mjs inspect` checks all nine L1 and both N1 timing previews and stores compact identities, readiness and Function regions. `run` uses the preselected L1 set 1, omitting and reporting unavailable variants. It issues one first-observed request per target, then 10 warmups and 60 C=1 measurements, interleaved in rotating variant order. There are three measured batches of 20 to stay under the client's 60-second maxDuration. Warmups occur only in batch 1. Reports use separate 5k and 200k windows. Each vector variant then gets four concurrent warmups and a C=4 window capped at 16 requests or two seconds, draining outstanding requests.

The Mac sends the same private bypass in `x-vercel-protection-bypass` to authorize the client and `x-bench-target-bypass` for the client to forward. The Function permits only HTTPS deployment hosts matching `next-scriptc-[a-z0-9]+-noahs-projects-8a075d15.vercel.app`, rejects credentials/ports/fragments, restricts paths to the measured routes and never follows a redirect. It neither writes nor logs the bypass. Do not add request-header logging to this endpoint.

TTFB is elapsed through receipt of response headers, as observed by Undici's diagnostics channel. Total time ends after the complete uncompressed body is drained, before concatenation, SHA-256, JSON validation and recording. Actual socket IDs and use counts also come from Undici diagnostics. A new target Function can be reached over an already-used origin connection. First-observed is not certified cold. No client-to-Mac response time enters the target samples.

Every sample records status, body SHA-256, result SHA-256, CDN/cache-control/content-type, `Server-Timing`, `x-vercel-id`, target instance and actual socket reuse. Vector response bytes must match the existing exact top-10 reference. Reports extract/decode the full `<pre id="result">` JSON and compare its hash with N1, with matching event count. Validation rejects cached HIT/STALE/PRERENDER, wrong regions and missing timings/instance observations. Failures stop the run and preserve completed samples without retries or printing remote bodies. CPU is process user+system delta, including the client's hashing/validation, with elapsed wall time, event-loop utilization and timer delay. No simultaneous client invocations are allowed within an instance.

Percentiles use nearest rank. `overheadP50Ms` is the median of each request's `totalMs - computeMs`, so it need not equal the difference of separate medians. Report `computeMs` is the N1 caller's complete `await revenue(...)` interval, not isolated native kernel CPU. Render and transport-beyond-render observations remain separate in the summary.

The retained 2026-10-31 run used an initial client for C=1, followed by two failed C=4 instrumentation attempts and a corrected client for C=4. See the research report for all failures and the three unretained initial warmup outcomes. The final implementation correlates diagnostics using a non-secret request ID header and drains concurrent warmups with `Promise.allSettled`. `finish-c4`, with an explicit `NEAR_CORRECTION` revision, is the narrow recovery path; it refuses duplicate revision windows and leaves all C=1 samples untouched. It is not used during ordinary fresh reproduction.

To regenerate this retained run's summary and report:

```sh
node examples/demo/bench/vercel/near-client/summarize.mjs
node examples/demo/bench/vercel/near-client/report.mjs
```
