# D1: one TypeScript cash-runway function in browser and native

2026-11-03. Implemented in `examples/shared-native`, using the same Next 16.4.3
and React 19.3.0 versions as `examples/demo`, with workspace adapter/core deps.
[Machine-readable measurements and verification](shared-native-demo-evidence.json).

## Function and execution

`lib/forecast.ts#forecast` takes five numbers: paths, seed, initial cash, monthly
revenue, and monthly costs. For each path it simulates 36 monthly revenue shocks,
1% cost growth, and cash movements. It reports paths surviving every month and
total ending cash. Interfaces, a closed helper, a constant horizon, loops, and
ordinary number arithmetic are shared unchanged. There is no native port.
The input tuple is only 71–73 JSON bytes across the measured path counts.
This is a plausible shared planning calculation, not a claim of a calibrated
financial model. Inputs at the HTTP boundary are bounded integers.

The deterministic Park–Miller PRNG multiplies integer state by 16807 modulo
2147483647. Products stay below 2^53. Monthly whole-dollar rounding makes results
inspectable. No random/time source enters the calculation. A parameter mutation
in an initial helper blocked discovery; rewriting it with local constants fixed
that without changing discovery files. The initial xorshift and Math.imul LCG
variants were slower natively (LCG roughly 3.3× V8 at 10k/100k). The final PRNG
has different compiler economics: native constant integer remainder beats V8's
floating remainder. The win is sensitive to the chosen implementation; high
compute per byte alone does not guarantee it.

The default `withScriptc` automatic mode accepts and compiles exactly one
function. A route handler and a client component import the same module. Browser
execution is JS, with a path slider and measured calculation duration. The server
starts in JS, collects default paired checks, and serves native once it wins.
No dispatcher policy override or forced lane is used. Adding `"use native"` to
the function body is documented as an optional build-enforced variant, not a
runtime speed or equivalence guarantee.

## Measurements

Apple M4 Pro, macOS arm64, Node 26.13.0, stock scriptc 0.4.6. Installation is
private to this worktree. The stock install initially left helpers non-executable;
plain `pnpm rebuild scriptc` did not repair them. Private copies of helper files
were made before running the installed scriptc postinstall, avoiding shared-store
inode permission changes. Doctor then passed every check. Compiler sources and
the protected checkouts were not used.

`pnpm --filter shared-native bench /tmp/shared-native-bench.json` loads the normal
Next adapter's `.next/scriptc-promotion/promotion.node`, IDs and schemas. It checks
canonical equality, warms each lane 30 times, and alternates lane order over 51
wall samples. Native includes the checked argument encoder, addon call, and result
decoder; JS is the original function imported by Node's TS loader. Medians:

| Paths | JSON tuple bytes | JS ms | Native ms | Native / JS | Speedup |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 71 | 1.555 | 0.221 | 0.142 | 7.02× |
| 10,000 | 72 | 15.927 | 1.923 | 0.121 | 8.28× |
| 100,000 | 73 | 159.421 | 18.712 | 0.117 | 8.52× |

Independent CLI command:

```sh
node packages/scriptc-promote/src/cli.mjs report examples/shared-native --measure --inputs examples/shared-native/bench/inputs.json --json /tmp/shared-native-measured-final.json
```

All inputs are user-provided, N=24, thread-CPU metric:

| Paths | JS median ms | Native median ms | JS p10–p90 ms | Native p10–p90 ms | Verdict |
| --- | ---: | ---: | --- | --- | --- |
| 1,000 | 1.578 | 0.213 | 1.536–1.608 | 0.203–0.228 | native |
| 10,000 | 15.916 | 1.929 | 15.872–15.985 | 1.883–1.944 | native |
| 100,000 | 176.002 | 20.709 | 159.479–205.398 | 18.676–23.332 | native |

Single-host runs overlap unrelated test activity and have no confidence intervals.
No Rust/C reference was added: verifying source sharing and actual dispatcher
service took priority. Times exclude HTTP, cold start, build, and training.
Browser timings are separate: one headless Chrome run showed 6.300 ms browser JS
and 1.946 ms server call for 10k paths, with exactly matching outputs (5,191
survivors and 1,918,005,384 total ending dollars). These do not establish a
cross-engine speedup ratio.

## Visible runtime evidence and privacy

The panel reads `runtimeSnapshot()` from `scriptc-promote/runtime` after the call.
A build-time ID derived by the existing source/name convention selects only this
function's snapshot. The serializer returns a fixed allowlist; no raw snapshot,
arguments, results, errors, process ID, paths, or stacks enter the panel. Normal
compute results are returned separately by the route. A native lane is only shown
when observed; dev/unwrapped JS reports no observations.

The production HTTP test first compared 12 inputs (1k/10k/100k paths × seeds
1, 42, 2147483648, 4294967295), then sent sequential calls until the ordinary
policy selected native. The test repeats all 12 seeded cases after promotion to
exercise native service across the whole seed/size set. It observed 26 verified checks, zero mismatches, zero
fallbacks, 24 decision pairs, native/JS ratio 0.139, and an actual native call.
A separate fresh-process browser run clicked **Collect verification samples**
and showed exact canonical equality, native lane, 26 checks, zero mismatches and
fallbacks, two native calls, and ratio 0.165. The action warms 1k-path inputs then
compares the currently selected input. All three inputs share bucket 0: this demo
does not prove per-input-size dispatch. Observations are process-local and may
change with rechecks. Browser reload alone does not reset server state.

File capture with `SCRIPTC_PROMOTE_SNAPSHOT=/tmp/shared-native-final-runtime-%p.json`
and `report --runtime` also merged observed state successfully. No library-owned
HTTP visibility endpoint was introduced.

## Checks

- Production example build passes, one native function; existing Turbopack dynamic
  filesystem tracing warnings remain in the generated runtime, outside this demo.
- Example unit tests: 2 pass (seeded determinism, immutable inputs, bounds, aggregate
  allowlist and empty snapshot). Production HTTP test passes all 12 seeded cases,
  actual automatic native service, panel shape and invalid-input rejection.
- CLI fuzz: seed 42, budget 2,000 ms, maxCases 64, one discovered/compiled automatic
  function; 64 comparable cases pass, 9 encoder refusals, 10 uncomparable JS cases,
  zero native fallbacks. These exclusions are not equality successes. Overall
  elapsed 3.694 s; no mismatch found. Runtime shadows remain enabled.
- Doctor: every check passes after worktree-local postinstall repair.
- `packages/next-scriptc pnpm test`: 102 pass, zero failures.
- `packages/scriptc-promote pnpm test`: 68 pass, two existing skips, zero failures.
  Initial runs before the helper repair failed and were rerun successfully.
- Headless Chrome clicked the sample-collection action and verified the populated
  page. The design inspector passes at 1440/768/390 with zero failures and two
  whitespace warnings; screenshots were inspected. The capped canvas and initial
  empty result area explain those warnings. Direction: Framed sheet, seed 69309851,
  with offline system typography. No images, external fonts, or sample customer
  data. Visual assessment: hierarchy 8/10, readability 8/10, distinctiveness 6/10;
  this is a compact working demo rather than a marketing page.

The evidence establishes a local, purpose-built compute win with sampled
verification. It does not change the roadmap's statement that real-app automatic
wins remain unproven, establish universal equivalence, or demonstrate browser
wasm, fleet telemetry, production savings, or a forecast suitable for decisions.
No deployments, external hosting services, Docker, secrets, pushes, PRs, issues,
public posts, root README edits, or discovery edits were involved.
