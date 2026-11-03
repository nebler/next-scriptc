# E4: boundary decode paths and shared construction preflight

2026-11-03. Stock npm scriptc 0.4.6 on macOS arm64. All fixtures are repository-owned or constructed for this experiment. No Papermark or HELD_OUT source, fixture, or executable is used.

## The default declaration already selects typed decode

The generated `JSON.parse(p0) as Parameters<typeof f0>[0]` retains concrete type information. Inspecting the generated library LLVM IR gives these paths:

| Boundary | Fixture | Emitted path |
| --- | --- | --- |
| Plain JSON parameter | Array of amount, weight, enabled records | Schema, with erased fallback |
| Projected read-and-pass input | E1's unchanged eight-field source, three-field projection and original-reference handle | Schema, with erased fallback |
| Specialized call site | Generic `sum<T>` called with fresh record literals, lowered by K4 discovery | Schema, with erased fallback |
| Constructed event record | event, timestamp, session, duration, country, mobile, tags | Schema, with erased fallback |
| Unsupported nullable-record array | `({amount:number}\|null)[]` | Erased |
| Asserted JSON string, default catches | String parsed inside the function | Schema, with erased fallback |
| Asserted JSON string, explicit construction preflight before fix | Same record array | Erased preflight plus schema parse inside function |
| Asserted JSON string, shared preflight after fix | Same record array | One schema parse, with erased fallback |

Both parser symbols in a schema helper do **not** mean two unconditional parses. Its control flow calls `scr_json_parse_schema`, tests for a non-null result, and returns immediately on success. Only a quiet decline calls `scr_json_parse` and the checked converter. Duplicate keys can take this fallback, so “one parse” means one source-level decode request. The compiler may internally retry a schema decline.

The retained `results.json.gz` includes exact call instructions, schema-helper bodies, generated entries, native closures, every timing sample, fuzz results, and dispatcher snapshots. `build.mjs` uses stock library builds, whose `entry.lib.ll` files retain IR. The baseline signature snapshot makes the reproducer independent of later adapter changes.

No declaration change is needed for the ordinary, projected, or specialized JSON ABI. Opaque wire handles are numeric branded values inside the concrete projection, rather than erased application objects. The unsupported union retains stock scriptc's checked erased path. These fixtures establish emitted paths, not coverage of every TypeScript type or proof that every runtime payload hits the schema fast branch.

## Construction guards concern asserted string parses

The motivating double parse is narrower than the initial hypothesis. Construction proof guards arise from `JSON.parse(text) as T` inside a function whose boundary parameter is a string. The entry parses that string for a dynamic preflight, then the function parses it again. Normal JSON parameters do not acquire this guard merely because their ABI is JSON. Default `catchFallback:true` omits separate construction preflights, and opaque inputs force that catch mode.

For a single top-level asserted parse initializer, the build now adds a native-only typed parameter. The entry decodes into that parameter's bounded construction shape, runs the same generated value predicates, and passes the value into the original asserted parse site. The original string remains available. The assertion at that site remains. The JS closure, wire ABI, encoder, and dispatcher policy remain unchanged.

A checked decode rejection returns the same sentinel as a failed construction guard. The host's existing `parseInputs` check rejects malformed JSON before this no-catch lane. Required fields, scalar kinds, nullable values, finite numbers, and handle predicates retain their checks. Extra JSON properties do not authorize extra construction fields. Schema fallback preserves duplicate-key semantics.

Repeated parse sites, conditional or nested initializers, unsupported construction shapes, strict closures, mandatory catches, and strict-result builds retain their existing path. Sharing repeated allocations could change object identity, so the optimization excludes them. An earlier experiment passed a dynamic value into a checked conversion. Stock scriptc crashed on an empty array in that configuration, so that implementation was discarded. The retained implementation uses a typed handoff and passes the native edge tests.

## Measurement method

The own event fixture is deliberately simple and does not reproduce PM2 compute. E1 uses its original fixture through current discovery and the generated projected encoder. The guarded fixture parses the plain record array from a string and computes a numeric sum. Sizes are 600, 6,000, and 60,000 records.

Each cell warms eight calls and retains 32 samples. Each result is canonically compared with JS outside the timed calls. Total native includes host validation, encoding, addon execution, and result decoding. Native decode uses the addon's stage clocks. The before/after delta includes the removed erased parse and differences in guard representation, conversion, and temporary lifetime; it is not an isolated parser-only timer. For the guarded string fixture, an additional callback immediately after the original asserted initializer puts both parses, the guard, and conversion before the decode clock boundary. Without that callback, the inner parse would misleadingly count as compute.

The mode order is default, before, after. These are descriptive sequential medians from one host session, without confidence intervals or process-order randomization. Other agents and desktop processes remain active. No task-owned build or test overlaps timing. Stage wall times and process CPU medians are different clocks and do not form an exact decomposition. There is no Docker, stand-in container, hosted call, or billing measurement.

The dispatcher trains 700 calls separately for each E1 and guarded fixture size and mode, using unchanged default quotas and thresholds. Training samples are excluded from fixed-lane timing. Snapshots distinguish completed decisions from quota-limited learning.

All values are median milliseconds. “Before” and “after” use explicit construction preflights. E1 forces catches in both modes and has identical generated entry source, so its differences are host variation, not an implementation effect.

| Fixture | Records | Decode before | Decode after | Total wall before | Total wall after | Total CPU before | Total CPU after | JS CPU after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| guarded | 600 | 0.354 | 0.206 | 0.591 | 0.439 | 0.594 | 0.442 | 0.188 |
| guarded | 6000 | 4.437 | 2.551 | 7.037 | 5.128 | 7.040 | 5.230 | 2.103 |
| guarded | 60000 | 47.369 | 27.296 | 75.874 | 57.864 | 75.915 | 57.698 | 22.908 |
| e1 | 600 | 0.039 | 0.048 | 0.278 | 0.333 | 0.280 | 0.336 | 0.004 |
| e1 | 6000 | 0.386 | 0.412 | 2.879 | 3.014 | 2.872 | 3.015 | 0.031 |
| e1 | 60000 | 4.727 | 4.232 | 46.910 | 43.719 | 76.789 | 70.174 | 0.378 |
| event | 600 | 0.099 | 0.100 | 1.402 | 1.332 | 1.357 | 1.326 | 0.004 |
| event | 6000 | 1.010 | 0.997 | 18.229 | 13.321 | 14.574 | 13.269 | 0.036 |
| event | 60000 | 9.794 | 10.054 | 141.771 | 137.910 | 140.345 | 138.975 | 0.383 |
| plain | 600 | 0.240 | 0.227 | 1.189 | 1.171 | 1.178 | 1.150 | 0.004 |
| plain | 6000 | 3.954 | 3.083 | 18.336 | 20.732 | 13.339 | 13.151 | 0.027 |
| plain | 60000 | 34.571 | 37.408 | 175.267 | 188.988 | 140.169 | 136.516 | 0.350 |
| union | 600 | 0.053 | 0.053 | 0.454 | 0.360 | 0.468 | 0.362 | 0.001 |
| union | 6000 | 0.519 | 0.525 | 3.511 | 3.514 | 3.507 | 3.509 | 0.009 |
| union | 60000 | 5.203 | 5.225 | 38.782 | 39.283 | 41.230 | 41.484 | 0.111 |

Guarded native decode falls by 41.8% at 600, 42.5% at 6,000, 42.4% at 60,000. The guarded 60k total falls by 23.7% in these sequential windows. Host `parseInputs` validation remains and costs about 20.5 ms after the change; this work removes the extra native parse, not that JS validation.

All 18 trained buckets finish `js-final`, each with 26 verified shadows, zero mismatches, and zero native fallbacks. The optimization does not establish a promotion win. Default guarded-string decode is 27.220 ms at 60k, versus 27.296 ms with the new explicit preflight; default avoids the host parse preflight and has 37.854 ms total wall.

The first measurement attempt failed while evaluating an ESM export as a function body. The next stopped before E1 timing because the identity oracle used the lowered native closure. A later guarded fuzz check incorrectly discarded fallback markers from timing wrappers. The corrected driver retains fallback markers, uses the original E1 JS source, and resumes only unrecorded cells. No retained cell is rerun or selected by its speed.

## PM2 estimate from published stages only

PM2's published 60k stage medians sum to 195.621 ms: 126.489 encode + 1.633 copy + 26.964 decode + 36.318 compute + 4.105 native encode + 0.010 copy back + 0.102 JS decode. This is a sum of wall-stage medians, not measured total CPU.

For the default adapter path, E4 removes no separate preflight. The conservative updated estimate therefore remains 26.964 ms decode and 195.621 ms stage sum, with no predicted lane change. PM2 published a 1.72 paired native/JS CPU ratio and zero winning votes at 60k.

As a conditional sensitivity estimate only, if *all* PM2 decode behaved like this explicit guarded-string fixture, multiplying decode by 0.5762 gives 15.538 ms and a 184.195 ms stage sum, a 5.84% reduction. That affected fraction is unverified, and the actual default path supports a fraction of zero for this duplicate-guard optimization. Even deleting the full published decode stage gives a 168.657 ms stage sum, only 13.78% lower. None of these arithmetic substitutions establishes a CPU ratio, a dispatcher decision, or a hosted saving.

This estimate uses only PM2's published stage numbers. It is not a Papermark run, application speedup, or hosted CPU prediction. PM2's actual historical emitted IR is not established by this experiment. The constructed event fixture shows what stock scriptc emits for a representative eligible record shape, not what PM2 necessarily emitted.

## Validation and reproduction

Run `node research/boundary-decode-path/build.mjs` from a dependency-installed worktree, then `node research/boundary-decode-path/measure.mjs` after builds and tests finish. The build needs stock scriptc 0.4.6 and the Node headers used by the normal adapter builder. Dependencies and compiler binaries are installed only in this worktree. The baseline signature is adapter source, not copied compiler source.

Next `pnpm test`: 102 passed. scriptc-promote `pnpm test`: 64 passed, two existing skips. Targeted decode tests: five passed. The measurement driver additionally runs 128 T1 cases for each of 15 fixture/mode combinations, with all differential checks passing; native fallback remains an accepted result. Logs and individual fuzz counts are adjacent to this report.

The generated-entry tests check one parse, the typed declaration, guard ordering, the original string, and repeated or conditional parse exclusions. T1 input generation and the native differential oracle cover finite and nonfinite numbers, wrong types, missing fields, duplicate keys, extra fields, Unicode, signed zero, and empty arrays. Compiler schema fallback remains part of the contract.
