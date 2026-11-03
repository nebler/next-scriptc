# Profile-guided promotion (P3)

2026-11-03. EV3 accepted 441 functions across DEV apps, mostly small helpers.
Static acceptance could not prioritize the few functions consuming request CPU.
P3 joins V8 CPU samples to the existing discovery report without changing discovery
acceptance or dispatcher policy. [User guide](../docs/find-what-to-promote.md).
[Recorded aggregate evidence](profile-guided-evidence.json).

## Design and attribution

`report --profile file.cpuprofile` accepts repeated files. The new
`report-profile.mjs` module validates sample IDs, timing arrays, and the frame tree.
It attributes each sample's delta to the leaf's self time and each distinct source
function in its ancestry to inclusive time. Recursion counts once per source
function per sample. Profiles without deltas use duration divided by sample count
and label that approximation. Idle is recorded separately and excluded from CPU
shares. GC, native, dependencies, and unknown frames remain in the denominator.

Node's `SourceMap` consumer resolves frame positions using local external,
adjacent, inline, or indexed maps. Source roots are resolved explicitly because
Node's consumer returns raw source names. File URLs, webpack paths, and Turbopack
`[project]` paths resolve against the report root and unique source suffixes.
TypeScript AST ranges identify the innermost source function. Existing report
rows supply exact status and diagnostic text. Nested functions and methods outside
that inventory appear as excluded, without changing discovery's counts or rules.
A unique file and function-name match is labeled heuristic if position evidence
is absent. A global name match alone is insufficient. Unmapped leaves are retained.

Ranking uses self CPU potential to avoid counting a hot callee again in its
caller. Inclusive CPU identifies async handlers worth inspecting for outlining.
Accepted, explicit, rejected, and excluded rows retain their static meaning.
Hot blocked rows carry exact diagnostic text and the existing diagnostic repair
hint. Silent exclusions have an explicit explanation of what is known, including
async functions and native routes using the separate route compiler. Suggestions
are bounded, advisory text; the CLI never edits source or changes dispatch policy.

With boundary-inclusive thread-CPU measurements, the optimistic estimate uses
`selfShare * max(0, 1 - bestNativeJsRatio)`. Measurements take precedence over
snapshot buckets. The best input/bucket is optimistic, not a traffic-weighted
ratio. Without CPU evidence, potential is only the self share ceiling, explicitly
labeled. Wall measurements are excluded. Shares and estimates are not additive.

## Local end-to-end validation

Worktree-local pnpm dependencies, Node 26.13.0, Next 16.4.3, stock scriptc 0.4.6,
macOS arm64. Both production builds passed:

```sh
pnpm --dir examples/shared-native build
NEXT_SCRIPTC_BASELINE=node pnpm --dir examples/demo build
node scripts/profile-guided-demo.mjs
```

The reproduction script starts the built servers on localhost ports 3411/3412,
waits for readiness, and uses an inspector session in each server process.
It starts profiling after readiness and stops before shutdown. It retains profiles
under a fresh `/tmp/scriptc-profile-*` directory. Shared-native receives 12 POSTs
to `/api/forecast`, each with 100k trials, seed 42, cash 500k, revenue 100k, costs
110k. This captures the initial JS/training period before ordinary promotion, not
steady-state native service. First-request module/addon setup remains included.
Demo runs 30 serial rounds over primes at limit 3m, Markdown post
`reliable-webhooks`, and search `q=desk&limit=7`. Every response must succeed.
Demo uses its existing JS baseline configuration, preserving `.native.ts` routes.
No database, external service, or held-out app is used.

Recorded commands on the initial captures:

```sh
node packages/scriptc-promote/src/cli.mjs report examples/shared-native \
  --profile /tmp/p3-shared-native.cpuprofile --measure \
  --inputs examples/shared-native/bench/inputs.json --suggest \
  --json /tmp/p3-shared-measured.json
node packages/scriptc-promote/src/cli.mjs report examples/demo \
  --profile /tmp/p3-demo.cpuprofile --suggest --json /tmp/p3-demo-report.json
```

Quoted profile rows, with diagnostic prose shortened:

```text
2819.8 ms non-idle sampled; 87.28% self CPU mapped to app functions
lib/forecast.ts#forecast lib/forecast.ts:20 — accepted; self 87.28%, inclusive 87.28%; potential 77.28% (optimistic estimate using best --measure native/JS CPU ratio; assumes JS baseline and representative inputs); mapping source-map
app/api/forecast/route.ts#POST — excluded (async; inspect sync core); self 0.00%, inclusive 94.78%
Suggested actions:
  Consider adding 'use native' to forecast at lib/forecast.ts:20 for build-enforced compilation; measure representative inputs first.

852.6 ms non-idle sampled; 45.05% self CPU mapped to app functions
app/api/primes/route.native.ts#GET — excluded; self 44.41%, inclusive 44.42%; potential 44.41% (CPU share ceiling only; no measured CPU ratio); mapping source-map
app/api/search/route.native.ts#GET — excluded; self 0.64%, inclusive 3.81%; mapping source-map
Hot but blocked:
  app/api/primes/route.native.ts#GET — Native route handlers use the separate route compiler; extract a pure synchronous helper for function promotion.
```

Forecast ranks first and is accepted. This is the D1 purpose-built numerical
control, not proof of a real-app automatic win. The estimate is conditional,
not an observed 77.28% endpoint saving. Demo's hot prime route makes the separate
route/function boundary visible. Library search, Markdown, GC, inspector overhead,
and setup explain much of demo's unmapped share. No rejected discovery row happened
to receive a mapped sample in these short captures. Tests cover that join directly,
including unchanged exact blocker text and guard-index hints.

## Mapping accuracy and limits

Both real captures resolve minified/bundled Next server chunks through emitted
maps. The expected forecast and prime source functions and lines are recovered.
All attributed app rows in these captures use source maps, with no heuristic
matches. The 87.28% and 45.05% numbers measure coverage of non-idle self samples,
not mapping accuracy. No corpus-wide accuracy rate is claimed.

A controlled minified fixture maps renamed generated functions back to two source
functions with known self/inclusive weights. Additional tests cover inline indexed
maps, sourceRoot, direct discovery joining, explicit/excluded/rejected statuses,
repeatable CLI flags, recursion, invalid profiles, missing timing, all-idle input,
CPU ratios, wall-ratio exclusion, snapshot ratios, and honest heuristic labels.
Vite/Nitro map formats use the same consumer; no new live Nitro deployment was run.

Maps and sources must match the captured revision. Remote maps are not fetched.
Chained transformations without a final map to app source, eval-only code, virtual
sources without a local inventory file, and missing/minified symbols may remain
unmapped. Original source text embedded in maps is not substituted for local source.
Inlining, native execution, and async continuations limit attribution. Static
first-blocker diagnostics cannot prove that one refactor makes a function compile.
Sampling durations approximate CPU and do not replace OS CPU accounting, endpoint
measurements, or the unchanged runtime verification and dispatch policy.

Both requested package suites pass: next-scriptc 102 passed; scriptc-promote
72 passed with two existing skips. Four new profile tests pass.
`git diff --check` passes. The reproduction script also completed a second pair of
captures successfully. No root README, discovery/build implementation, main
checkout, protected compiler tree, held-out repo, deployment, external account,
Docker, push, PR, issue, public post, or secret is involved.
