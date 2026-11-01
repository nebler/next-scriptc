# Papermark local correctness gate

2026-11-01. The unchanged `documentViewDistribution` passes the local correctness gate on darwin arm64 and Linux arm64 with stock scriptc 0.4.6. Three adapter fixes were necessary. No workload timing or CPU result is reported. Papermark remains held-out; no policy or compiler tuning used these fixtures.

## Source and scope

Papermark is pinned to `ed19717ec02a1ac79aecf5569159aa9d2d869312`, the R1 commit, in `/Users/noah/code/papermark-gate`. The shallow, sparse checkout contains `lib/video-analytics` and root files. Its git status is clean. The target is `lib/video-analytics/playback.ts:89`; its complete file SHA-256 is `9bf4d1fc55df8588be0804d333c2e42e6ade6e4a8404847a2cc380809c60e3e2`.

Papermark is AGPLv3. No Papermark source, extracted function, generated native source, or binary is committed here. A byte-for-byte copy of the complete playback module lives outside this repo in `/Users/noah/code/papermark-gate-slice/lib/video-analytics/playback.ts`. The harness asserts its hash before discovery.

The slice uses Papermark's strict tsconfig, a small Pages API route importing the unchanged module, and an installed symlink to this branch's adapter package. Its Next config calls `withScriptc({experimental:{cpus:2},distDir:'.next-app'}, {nativePromotion:'auto'})`. The source module has no imports. This avoids installing the app's database, authentication, Tinybird, and UI dependencies while preserving its complete local helper closure and real boundary types.

Discovery below covers every function export in that module and the slice route. It is not a whole-Papermark candidate census, production endpoint test, or proof that the full app builds with this adapter. The slice route's default handler is outside named-export discovery. No Papermark application code changed.

## Discovery and adapter fixes

On main, the local adapter never reaches auto discovery because `withRewrites` drops the options metadata from its replacement callback. Direct discovery on main also rejects `documentViewDistribution` and `viewPlaybackTimeline` with `purity: nonlocal mutation`: their final sort operates on a freshly allocated `Array.from(...).map(...)` chain.

The fixes are:

1. Preserve the symbol-keyed build options when local route rewrites wrap the config callback.
2. Recognize fresh array literals and unshadowed `Array.from` or `Array.of`, followed by allocating array operations. Their container can be sorted without mutating arguments or module state. Opaque calls, shared arrays, parameters, and shadowed `Array` remain rejected. No purity bypass or function-specific exception was added.
3. Compile local promotion artifacts under Next's preserved `distDir/cache/scriptc-promotion`. Copy only `promotion.node`, `ids.json`, and `encodings.json` to the final runtime directory at build completion. Next otherwise deletes the addon after `modifyConfig`, leaving the emitted wrapper without its artifact. The existing hosted output path is retained; no hosted action was run.

Unit tests cover fresh chains and rejected aliases, metadata retention, and artifact publication and removal. The installed Next 16.4.3 webpack build now discovers the target, compiles it, emits its wrapper in `server/pages/api/distribution.js`, and retains all three runtime artifacts after build completion. A local `next start` smoke test returns identical response bytes for 20 POSTs and enters shadow state at call 20. No unavailable-addon warning or demotion appeared. The detailed comparison assertions use the dispatcher checks below.

Every playback export receives this first rejection or acceptance after the fixes:

| Export | Result |
| --- | --- |
| `isCountablePlaybackEvent` | Work screen: no loop, recursion, array callback, or JSON parse |
| `countablePlaybackEvents` | Boundary: `events` includes `undefined` |
| `playbackSeconds` | Boundary: `event.view_id` is optional, `string \| undefined` |
| `resolveVideoLength` | Boundary: `stored` includes `undefined` |
| `watchTimeSeconds` | Boundary: `events[].view_id` is optional |
| `completionRate` | Work screen: no loop, recursion, array callback, or JSON parse |
| `documentViewDistribution` | Accepted, compiled; parameters `json, number`, result `json` |
| `viewPlaybackTimeline` | Boundary: `events[].view_id` is optional |
| `eventsForView` | Boundary: unresolved generic `T` in `events[]` |

The build reports the first applicable rejection, not every hypothetical later failure. No accepted candidate receives an SC diagnostic. `playbackSeconds` remains a reachable compiled helper without becoming a dispatcher boundary. R1's 52/52 coverage applied to its earlier combined probe, not a new whole-app coverage claim.

## Native correctness

[The harness](papermark-local-gate/run.mjs) uses the adapter's discovery, checked signatures, library build, addon loader, source loader transformation, promotion client, and real dispatcher. It injects the loaded dispatcher into the promotion client's instance map so every fixture immediately shadows. Caller answers remain JS. Each case waits for the async native shadow and asserts that the verified count increases by one, with no demotion. The real strict canonical-byte comparison runs inside the dispatcher, after transport encoding and native result decoding.

For this correctness-only run, `jsSamples=1`, `sampleEvery=1`, and a 1000-pair epoch prevent any lane decision. Production defaults are unchanged. No measured duration is retained. Mismatch testing calls the real addon's `runShadow`, replaces its output with `[]`, and verifies permanent mismatch demotion with an input hash. Three calls still return the JS answer, with zero native answers.

Both targets pass the same 12 cases:

- Empty input at video lengths 0 and 600, and a single interval.
- Unicode viewer IDs, combining characters, emoji, and embedded NUL.
- Negative zero in an interval and in the direct numeric argument.
- Sparse buckets near `2**40`, without allocating an enormous video-length range.
- Fractional, overlapping, negative-start, repeated-viewer, and reversed intervals.
- Histories of 60, 600, 6,000, and 60,000 playback event records.

Historical records include timestamps, volume, playback rate, flags, and a nullable extra field. The public `view_id` boundary must be a string: the intersection makes it required. Null is tested in optional extra fields, not substituted for that required string. Ten-second intervals over a ten-minute video give 60 records per complete view, so 6k and 60k records represent 100 and 1,000 historical complete views, matching R1's size convention. Fixtures are synthetic, not production traces.

[Host results](papermark-local-gate/darwin-arm64.json) and [Linux results](papermark-local-gate/linux-arm64-gnu.json) retain every discovery rejection, case size, canonical result byte count, SHA-256, verification count, and mismatch transition. All 24 shadows pass. Both mismatch tests demote. The host uses Node 26.13.0; the cached Linux stand-in image uses Node 24.22.2. The Linux addon is cross-compiled with Zig and the stock GNU arm64 runtime pack, then loaded and exercised in `nsc-standin-papermark`, capped at one CPU, CPU set 0, and 2 GiB memory, with networking disabled. The container is removed afterwards.

## Failures, gaps, and validation

The first full Next slice build succeeds with no candidates because config metadata is lost. After that fix, the build reveals an SC3004 checker-startup permission error. The package manager had relinked reused dependency directories into a fresh worktree install whose bundled checker lacked execute permission. Restoring the reused links and using the absolute existing stock compiler path resolves the environment failure. No compiler source change was made. The following build compiles the target but loses the addon to Next cleanup, motivating the artifact lifecycle fix.

[Initial build](papermark-local-gate/next-build-before.txt), [permission failure](papermark-local-gate/next-build-permission-failure.txt), [completed build](papermark-local-gate/next-build-after.txt), and [HTTP smoke result](papermark-local-gate/next-http.json) retain that evidence. Build tool elapsed-time messages are incidental logs, not workload measurements.

No scriptc semantic or lowering limitation was hit by the target, so there is no new compiler patch candidate or minimal repro to add to `scriptc-patches.md`. SC3004 above is an executable-permission setup failure, not a language limitation. Existing ledger candidates remain unresolved. No upstream filing occurred.

Validation passes: 48 package unit tests and 24 demo tests, plus 15 focused promotion tests after the final artifact error-handling change. The full slice build and 20 HTTP requests pass. Native correctness runs are serial, and Next uses at most two build workers. No Vercel, existing Docker container, or root checkout README was changed.

## Reproduction and cleanup

Create a shallow external checkout of `https://github.com/mfts/papermark.git`, fetch the pinned commit with `--depth 1`, and sparse-checkout `lib/video-analytics`. Copy its complete playback module and root tsconfig into an external slice at the path above. Add the importing API route and Next config described above. Link existing Next, React, React DOM, TypeScript, Node types, and this adapter into that slice's node_modules; the full Papermark dependency install is unnecessary.

Run `SCRIPTC_COMPILER=/absolute/path/to/stock/scriptc.exe node research/papermark-local-gate/run.mjs`. Add `linux-arm64-gnu` to cross-build. For Linux verification, mount the slice, this repo, and the reused dependency directory at their original paths into a new arm64 Node 24 container, then run the same command with `GATE_VERIFY_ONLY=1`. `PAPERMARK_SLICE` can override the external slice path. The harness never writes Papermark source into this repo.

Generated Next outputs, native archives, runtime packs, addons, and node_modules created for this task are removed after validation. The small pinned external source checkout and external slice source remain. Disk began at 8.2 GiB free. The final reading is recorded below; concurrent work also changes disk use, so the difference is not attributable solely to this gate.

Final free disk: **9.4 GiB**, compared with **8.2 GiB** before the task. The external source checkout is about 1.7 MiB. The dedicated container is absent, and no task-created node_modules or generated build directory remains.
