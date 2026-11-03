# Roadmap

2026-11-02. Where next-scriptc / scriptc-promote is going, and the order we climb it.
Evidence behind each item lives in [research/hill-log.md](research/hill-log.md).

## The product

One engine, two modes, one report.

- **Automatic (default).** Install it. Discovery finds sync, pure, JSON-boundary
  functions; the dispatcher shadow-verifies native against JS and promotes only what
  measures faster. Everything else is left alone (~60 ns wrapper cost).
- **`"use native"` (explicit).** Mark a function you know is hot. It is compiled or the
  build fails with an actionable reason. Same verification and fallback.
- **`report`.** Per route: what is promoted, what is blocked and why, nearest misses,
  measured native/JS ratio. The bridge between the two modes.

### Why TypeScript instead of SQL or Rust

1. **One function everywhere.** The same source runs as JS in the browser, native on
   Node, wasm or JS on Workers, JS on Bun/Deno. Shared client/server logic stays shared.
2. **Free differential testing.** JS is the reference implementation; the dispatcher
   keeps checking native against it in production and falls back on mismatch. A Rust
   port or a SQL duplicate drifts silently.
3. **Never breaks the app.** No native artifact, unsupported platform or stale build
   means JS. No per-platform prebuilt-binary failures.
4. **Per-call economics.** Small inputs stay in JS, large ones go native. A Rust addon
   pays FFI on every call.
5. **Types are the interface.** Boundary encoders are generated from TS (including Zod)
   types; no hand-written bindings; the function keeps using the app's helpers.
6. **Scales out, tests easily.** Compute stays in cheap serverless CPU, not the
   database; plain unit tests; `"use js"` returns to normal debugging.

Where the alternatives win: SQL when the data is huge and already in the database;
Rust on raw speed, especially object/string-heavy code today.

### What we know (honest status)

- Mechanism works: numeric code 3–4× native, verified, correct lane selection.
- Real-app automatic wins: none proven yet. Papermark (held out) is even. EV1 found
  dense JS only in browser code, enterprise-licensed paths, or behind proof blockers.
  Mature apps have already moved heavy compute to SQL, native libs, Rust or Python.
- Native only wins when compute per input byte beats the boundary (~1.5 µs/event).
- Stock scriptc is ~5× slower than V8 on object/string-heavy code.

## The hills

### 1. Engine ceiling: how much code can win
| Hill | Why | Depends on |
|---|---|---|
| Compiler speed on object/string code | Native is ~5× slower than V8 on most real code; the biggest lever | scriptc fork |
| Native JSON decode speed | Decides small wins like Papermark | scriptc fork |
| Native-resident data across calls | Chained promoted functions keep data native instead of round-tripping JSON | adapter + compiler |
| Source-text passthrough | Hand native the original JSON text when input was just parsed; removes most encoding | adapter |

### 2. Language coverage: how much code qualifies
| Hill | Why |
|---|---|
| Cheap discovery blockers | `.d.ts` module-init proofs, package export conditions, decorators parsing, possibly-undefined indexed reads, local mutation (EV3) |
| Async outlining | Largest silent exclusion: run the pure sync core native, keep awaits in JS |
| Classes and methods | NestJS-style backends |
| Map/Set, Date subsets, callbacks, `in`, computed keys | Recurring census blockers |
| Whole npm libraries native | Promote heavy dependencies, not just app code |

### 3. Product: something people adopt
| Hill | Why |
|---|---|
| Friction log → actionable errors, setup, docs, naming | Developers using `"use native"` hit every rough edge |
| Visibility | Dispatcher state per function: lane, reason, shadow counts, fallbacks; runtime report section; CI report |
| Profile-guided promotion | Pick candidates from production CPU profiles, not static guesses |
| Zero-setup install | Prebuilt toolchain or one-step setup, JS fallback when missing |
| Editor integration | "would be native" / "blocked: guard this index" squiggles |
| Browser wasm | W1 opt-in Next/Vite client reactors, verified JS fallback; local D1 browser 1.5–1.64× |

### 4. Trust: stronger and cheaper safety
| Hill | Why |
|---|---|
| Type-driven build-time fuzzing | Catch mismatches before deploy, not only in production |
| Equivalence proofs for simple functions | Less shadowing, cheaper verification |
| Explicit numeric/edge semantics | −0, NaN, integer overflow pinned across JS, native, wasm |

### 5. Platforms
Cloudflare (wasm wins on compute-dense scalar-boundary code; better wasm codegen/SIMD;
Containers offload for heavy routes), Vercel hosted checkpoint (after Pro or
2026-12-01), Bun/Deno.

### 6. Proof and story
Held-out eval (EV1 frozen split + Papermark), browser+server demo, public write-up
(only after review), scriptc upstream collaboration and Next.js pitch (parked).

## Execution queue

At most two agents at once. Items touching the same subsystem run sequentially.
Held-out repos and Papermark are measured only at milestones, never tuned against.

| # | Item | Hill | Subsystem | Status |
|---|---|---|---|---|
| EV3 | Dependency-installed DEV census | eval | census | done: 15,638 considered / 441 accepted; real blockers = module-init proofs, export conditions, .d.ts graph, decorators |
| C1 | Compiler object/string codegen: profile and fix | 1 | scriptc fork | done: RC/boxing ~26%, layout probes ~14%; key-array fix −13.6% on enumeration, CSV unchanged |
| — | Compiler hill paused after C1d (entry 65): typed code at or past V8; erased gap needs a systematic inline-cache design with upstream | 1 | scriptc fork | paused |
| C1b | Escape analysis + scalar replacement of records (C1's top design) | 1 | scriptc fork | bounded step done: leaf teardown eligible for inlining; generic −12.6%, spread −16.1%; CSV inconclusive; full escape/SSA work open |
| C1c | Local record escape analysis and scalar replacement | 1 | scriptc fork | first opt-in version: alias groups, field writes, leaf strings, exact identity summaries; generic −57.0%; spread and D1/E1 unchanged; nested owned graphs and full gate open ([evidence](research/compiler-scalar-replacement.md)) |
| C1d | Guarded specialization of erased operations | 1 | scriptc fork | bounded string-index slice: erased path −18.2%, CSV −5.5% but still 5.49× Node; typed control unchanged, copy/generic regressions retained; full gate open ([evidence](research/compiler-erased-specialization.md)) |
| B1 | Cheap discovery blockers | 2 | discovery | running |
| P1 | Friction log, then actionable errors | 3 | DX | audit + small fixes done: [friction log](research/friction-log.md); larger diagnostic/runtime visibility work prioritized there |
| M1 | Measure DEV accepted functions (`report --measure`) | eval | report | after B1 |
| E2 | Source-text passthrough | 1 | boundary | done, negative: runtime provenance check costs 2× the encoder; full-text parse 10× projected decode. Code kept on branch only |
| C2 | Native JSON decode speed | 1 | scriptc fork | bounded slice done: ordered schema decode −8.1% flat / −3.8% nested at 60k; erased unchanged; emitted decoder design remains open ([evidence](research/native-json-decode.md)) |
| E4 | Check boundary decode path: typed `scr_json_parse_schema` vs erased, and the double `JSON.parse` in construction guards | 1 | boundary | done: eligible JSON, E1 projections and K4 types already use schema decode; single typed construction preflight cuts guarded 60k decode 47.369 → 27.296 ms; AUTO stays JS ([evidence](research/boundary-decode-path.md)) |
| A1 | Async outlining | 2 | discovery | after B1 |
| E3 | Native-resident data across calls | 1 | dispatcher/boundary | queued |
| T1 | Type-driven build-time fuzzing + numeric semantics | 4 | verification | implemented: opt-in host build gate, CLI, bounded shrinking, native/wasm semantics probes; [evidence](research/build-time-fuzzing.md) |
| P1b | Fix friction backlog: automatic default for Next (F2), diagnostics at source file:line with fix hints (F6, F7), toolchain vs code refusals (F8), explicit-native rows in report (F5), function counts + dev notice (F10) | 3 | DX | done: default enabled; source diagnostics + hints; toolchain JS fallback; explicit report status; function counts + dev notice; [evidence](research/friction-fixes.md) |
| P2 | Visibility: runtime report + CI report | 3 | report | done: aggregate runtime API + opt-in file capture, runtime report merge, CI baseline/failure rules, capped build names; [evidence](research/runtime-visibility.md) |
| L2 | Classes/methods, Map/Set/Date, `in`, computed keys | 2 | discovery | after A1 |
| P3 | Profile-guided promotion | 3 | report/build | done: CPU profiles + source maps, ranked static joins, hot blockers and suggestions; local Next captures ([evidence](research/profile-guided-promotion.md)) |
| P4 | Zero-setup install, naming, docs | 3 | packaging | diagnostics/docs done: doctor + simulated failures; nine packed local setups; helper approval repair documented; naming options without renames. Host toolchain and script approval remain required ([evidence](research/install-and-docs.md)) |
| — | Editor integration, equivalence proofs, whole-library native | 3/4 | — | later |
| D1 | Demo: one TS function as JS in the browser and native on the server, with verified results | 6 | examples | done: shared cash-runway simulation, automatic native service, exact browser parity, aggregate verification panel; local 7–8.5× numeric win ([evidence](research/shared-native-demo.md)) |
| W1 | Browser wasm for shared promoted functions | 3 | client build/runtime | done: opt-in Next/Vite assets, cached async loader, calibrated buckets and sampled verification; local D1 Chromium 1.5–1.64× ([evidence](research/browser-wasm.md)) |
| D1b | Re-measure the demo against well-written JS (integer PRNG); D1's 8× is mostly a Node float-modulo cliff (entry 67) | 6 | examples | running |
| HO | Held-out milestone eval | 6 | eval | after B1+A1 land and a boundary or compiler lever moves |

Standing rules: no public posts, upstream issues/PRs or production deploys without
explicit approval; fork work on local branches under `/Users/noah/code/scriptc-wt/`;
never commit third-party source.
