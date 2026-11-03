# Build-time differential fuzzing

T1 adds an optional build gate for synchronous promotions. It uses the actual
addon and the dispatcher's argument encoder, result decoder, handle table, and
canonical comparison. The reference is the extracted original JS closure; for
specialized signatures, generation uses the narrowed native input type while JS
retains its original implementation. EV2 measurement now imports the same
TypeScript shape synthesis.

## Execution and failure policy

The CLI discovers and builds automatic and explicit synchronous candidates.
The shared Node build hook runs after compilation. Each function gets a fresh
subprocess; the addon index is its position in the accepted list. A mismatch
shrinks within the remaining execution budget and reports source file, source
line, seed, argument tuple, and both canonical outputs. Automatic failures remove
the function and recompile the remaining set, preserving addon/ID alignment.
Explicit failures remove deployable addon metadata and throw. Unavailable checks,
native crashes, and zero comparable cases also demote or fail. Build results
remain in fuzz-results.json.

Fuzzing defaults to off. Defaults when enabled are seed 1, 100 ms execution,
256 cases, and 128 shrink attempts. One JS call has at most 50 ms. Process startup,
reference loading, and type analysis are outside the execution budget; a parent
watchdog kills the entire subprocess after budgetMs + 10 seconds. Compiler time
uses the existing build path. This is a bounded sampled check, not a proof or
an app sandbox. It executes application code; runtime shadows remain enabled.

The case prefix depends only on seed and types. A wall-clock budget can truncate
it at a different point on a different machine. Fix maxCases and allow enough
budget to reproduce a complete sequence. Diagnostic arguments use JS inspection,
preserving -0, undefined, NaN, infinity, and lone surrogates that JSON would lose.
Shrinking preserves a mismatch and reduces numbers, strings, JSON text,
array lengths/elements, and object fields. Its bounded result need not be the
globally smallest reproducer. Crashes/timeouts are unavailable checks, not
minimized semantic mismatches. No native hang is retried in the parent process.

Async explicit functions, routes, and Cloudflare's separate deployment build are
outside this host-addon gate. Run on the deployment target architecture; host
verification cannot load a cross-compiled addon.

## Generated values and limits

TypeScript literals, primitives, unions, tuples, arrays, records, and plain
objects supply the shape. Optional fields have absent, present undefined, and
null variants; the encoder decides which can enter native. Nullable and opaque
handle schemas supply bounded representatives when source types are unknown.
Recursive types and types deeper than 32 levels refuse synthesis. A synthesized
base value has at most 4096 nodes; type analysis has a 256-node budget. Arrays
start at 16 elements and include empty, singleton, and 64-element cases.

Numbers include signed zero, NaN, both infinities, MAX_SAFE_INTEGER − 1/0/+1,
int32 and uint32 boundaries, subnormal and maximum finite f64, fractional values,
and exponential-format thresholds. Strings include empty, NUL, 65,536 characters,
astral characters, combining sequences, lone surrogates, valid/invalid JSON,
duplicate JSON keys, and numeric-string keys. Object variants reverse property
insertion order and use distinct keys such as 01/2/10 and á/á. Generated duplicate
keys occur in JSON text; ordinary JS objects cannot hold duplicate own keys.
Seeded combinations follow the single-parameter edge sweep.

Encoder refusals, native fallback signals, and JS exceptions/unserializable
results have separate counters. They are not equality successes. This matters
for scalar numbers used as loop bounds and strings used as JSON text: many
type-correct values cannot complete or return comparable JSON. At least one
comparable case is required, with coverage counts retained for review.

## Numeric and ordering contract

The contract is observable JavaScript semantics for admitted calls. It does not
promise arbitrary-precision arithmetic or preserve distinctions erased by JSON.
The semantic fixture compiles unchanged for stock 0.4.6 native and wasm32-wasi.
The local wasm check uses the same reactor bridge as Cloudflare; no account,
network deployment, workerd service, or login is needed.

| Topic | Contract and regression probe |
| --- | --- |
| Negative zero | Scalar f64 preserves the sign and canonical comparison distinguishes -0 from 0. JSON transport canonicalizes either to 0. Object.is(-0,0) is false; Object.is(-0,-0) is true. |
| NaN and infinity | Scalar boundary rejects nonfinite inputs/results; the dispatcher retains JS. Strict JSON boundaries reject nonfinite values rather than silently changing them. An application that explicitly calls JSON.stringify gets JS null canonicalization: [NaN,Infinity,-Infinity] becomes [null,null,null]. NaN payload bits are outside the contract. |
| Integer arithmetic | Number uses binary64 rounding. 2147483647+1 is 2147483648; explicit bitwise coercion wraps to -2147483648. Math.imul(2147483647,2) is -2. MAX_SAFE_INTEGER+1 and +2 both round to 9007199254740992. No implicit int32 wrap is allowed for ordinary addition. |
| Float formatting | Canonical JSON bytes follow JS formatting, including 0.30000000000000004, 1e-7, 1e+21, and 5e-324. Raw string results compare exactly. |
| String comparison | UTF-16 code-unit order, without normalization or locale collation. Astral 😀 sorts before U+FFFF; é differs from e + combining acute. Scalar string encoding rejects lone surrogates; escaped JSON strings can carry them. |
| Sort | Equal comparator keys retain input order: (1,b),(1,a),(0,c) sorts to (0,c),(1,b),(1,a). |
| Map | Insertion order; setting an existing key preserves position; delete/reinsert moves it to the end. Fixture yields [["b",3],["a",4]]. |
| Set | Insertion order; duplicate add does not move a key; delete/reinsert does. Fixture yields ["a","b"]. Map/Set themselves are internal computation, not JSON boundary values. |
| JSON keys | Array-index keys enumerate numerically first; other string keys retain insertion order. Fixture produces {"2":2,"10":1,"b":3,"a":4,"01":5}. Comparison does not sort keys or ignore order. Duplicate parsed keys use the last value. |

All nine fixture outputs agree across JS, native, and the local wasm reactor.
This establishes these probes, not universal compiler equivalence.

## Reproduction

Run from this worktree with its own installed dependencies:

~~~sh
node packages/scriptc-promote/src/cli.mjs fuzz examples --seed 1 --budget-ms 100 --json /tmp/examples-fuzz.json
node packages/scriptc-promote/src/cli.mjs fuzz packages/scriptc-promote/test/support/fixtures --seed 1 --json /tmp/fixtures-fuzz.json
node research/run-build-fuzzing.mjs /tmp/corpus-fuzz.json
pnpm --filter scriptc-promote test
pnpm --filter next-scriptc test
~~~

The corpus runner inserts explicit directives at TypeScript body offsets and
writes only temporary sources under /tmp. Discovery still reports unsupported
fixtures; a refusal is not a successful comparison. The Next test/support
directory contains reexports, so a direct CLI scan there finds zero candidates;
the permanent core differential corpus supplies the executable fixtures.

## Overhead and findings

Recorded on this worktree's Apple Silicon host with stock scriptc 0.4.6; timings
are single local runs under concurrent tests and are not production estimates.
For all examples, discovery took 33.885 s, compilation 1.324 s, and the additional
fuzz phase 7.254 s for 16 functions (100 ms configured execution budget each).
The full command took 42.463 s. An individual Astro example took 1.334 s discovery,
1.458 s compilation, and 0.845 s fuzzing. Process/type setup dominates the
configured execution time, so enabling this by default would add material build
cost. The option stays off.

The final all-examples run compiled and checked 16/16 candidates, including the
explicit scalarWeight function. No native/JS mismatch was found. The directory
of core test fixtures compiled and checked 7/7 candidates in 17.352 s before the
last JSON-text additions; no mismatch was found. Per-function counts, refusals,
and output bytes are retained in the evidence JSON next to this report.

Implementation findings, fixed locally:

- Specialized functions initially used their broad original type for generation,
  producing five unavailable checks. Generation now reads the specialized
  signature while executing the original JS reference.
- JSON-parsing functions initially received too few valid JSON strings.
  nestedAggregation had zero comparable calls. Added array/object JSON text;
  the final example run checks it successfully. Zero comparable calls now have
  explicit inconclusive status.
- The initial unguarded JS probe of checksum with a very large numeric loop bound
  hit the subprocess watchdog. A per-call VM timeout now bounds the JS probe;
  oversized JS computations are counted separately.
- Shared-build tests deliberately compile a divergent native fixture:
  JS f(n) = n, native f(n) = n+1. The minimized tuple is [0], JS output 0,
  native output 1. Automatic promotion removes it and rebuilds the surviving ID
  table; an explicit directive fails the build and removes the addon.
  This is an injected regression fixture, not a stock compiler bug.

No confirmed compiler divergence was found, so no speculative Candidate patch
is added to scriptc-patches.md. Compiler sources remain untouched.

The permanent corpus runner checked 14/15 source fixtures successfully (all
explicit): discovery 12.733 s, compilation 3.277 s, fuzzing 11.728 s, total
27.739 s with a 200 ms execution budget. The remaining immutable fixture is an
existing discovery refusal, not a native mismatch: the lowered original-array
handle attempts to read __scriptcOriginal on an array type. Minimal source:

~~~ts
export function immutable(x:{n:number;s:string}[]) {
 "use native";
 return {a:x.map(v=>({n:v.n,s:v.s})),input:x};
}
~~~

Discovery reports TS2339: Property '__scriptcOriginal' does not exist on type
'{ n: number; s: string; }[]'. This is recorded for B1's concurrent discovery
work; the files owned by B1 were not edited. The helper field in the corpus is
also excluded by the normal work screen. Neither refusal is a compiler
semantic divergence. [Machine-readable evidence](build-time-fuzzing-evidence.json)
retains every checked function and all nine cross-target outputs.

Individual app configurations also pass: Astro 1, demo 11, Nuxt 1, React Router 2,
TanStack 1, and Vite 1 candidates. Probe and scout discover zero supported
candidates. The per-app configuration accepts the existing mismatchCandidate helper that
the root generic configuration refuses. Despite its name, native corruption is
only injected by a separate fixture harness; the ordinary compiled function
agrees with JS. Per-app results are retained under individualApps in the evidence
file.

Final Node 24 validation: scriptc-promote 53 passed, two existing skips, zero
failures; next-scriptc 101 passed, zero failures. The final shared-build and CLI
tests include a real compiled divergent fixture and both failure policies.
