# Runtime dependency closures and the Dub CSV blocker

2026-11-01. Branch `t3/runtime-import-promotion`, stock scriptc 0.4.6 library mode, Darwin arm64. This step adds conservative ESM closure promotion. Dub CSV remains in JavaScript. No CSV native speedup is established.

## Why promotion stops before CSV

K1's largest development target needs two separate proofs. Imported code must have no observable effects, and native execution must preserve the meaning of each accepted input. Removing the opaque-import rejection alone supplies neither proof.

`dependency-closure.mjs` resolves static named ESM imports, audits module initialization, renames module bindings, and extracts the reachable declarations into one source file. Automatic discovery invokes it with the application's parsed TypeScript options. Resolution uses TypeScript's runtime-file lookup with declaration files excluded. This covers configured TS paths, package exports conditions for ESM, and package main entries. A declaration file never substitutes for runtime code. Package tests put a throwing implementation behind the require condition to detect a wrong branch.

This supports the TypeScript resolver subset, not arbitrary Next webpack aliases, loader transforms, custom resolver plugins, or runtime import hooks. Configured webpack hooks and Turbopack resolver overrides disable imported closures. Unrecognized package export conditions, including node-specific conditions not modeled by this subset, also reject. Unresolved imports fail closed. Default declarations, namespace imports, re-exports, imported type linking, module cycles, dynamic imports and requires, and CommonJS linking remain unsupported. Untyped JavaScript can also fail the checked closure proof. For example, unresolved parameter types are not inferred from declarations in a different file.

CommonJS is deliberately rejected. Its writable export objects and getter-based re-export helpers need their own proof. A syntactic rewrite of `exports.f = f` cannot establish that another consumer never replaces `exports.f` before the app captures it. Even simple named destructuring does not prove that property stable. This limits the implementation, but preserves the automatic promotion contract.

The synthetic package test uses actual JavaScript ESM runtime code and a separate declaration file. The app test compiles a two-module typed helper closure with stock library mode and checks six forced-native outputs, including commas, quotes, newlines, formula prefixes, and Unicode. Its native-success counter confirms that fallback does not hide a mismatch.

## Initialization and effects

Every static runtime import is audited, including unused imports and side-effect-only imports. All top-level statements must be function declarations, type declarations, empty statements, supported imports or exports, or const declarations initialized with literal scalars or function creation. Scalar constants are inlined after linking; they have no object identity or initializer effects. No imported code executes during analysis.

Objects, arrays, regular expressions, Sets, Maps, call initializers, classes, mutable module bindings, and module binding reassignments are rejected. This rejects deterministic write-once object caches as well as mutable caches; no write-once proof is claimed. Reserved generated binding names are rejected to prevent capture during renaming. Unknown initialization fails before dead-code extraction can hide it.

The whole reachable extracted source must then pass `constructionProof`, independently of the construction-results optimization switch. Its allowlist checks calls, local allocation provenance, argument aliases and mutation, scalar operations, and result escape. The existing promotion purity screen still runs. Eval, Function, module objects, getters, prototype access, time, randomness, I/O, and unsupported dynamic syntax fail closed. This is intentionally stricter than existing local-only promotion.

The proof uses standard unmodified builtins and the existing JSON-data contract. It does not certify compiler lowering, allocation limits, or termination. Disabling implicit ambient `@types` loading in the self-contained proof prevents unrelated React and Node declaration errors; explicit imports still need resolution.

`dependency-report.json` records each selected module's content hash, nearest package name and version, package manifest hash, and the closure hash. Before compilation and during loader transformation, dependency and manifest hashes must still match. The loader registers these paths as build dependencies. A change asks for a restarted build instead of pairing stale native code with new JS. This report describes attempted candidates; compiler acceptance remains the builder's final filter.

## What runs when the CSV packages load

The pinned Dub commit is `6b463b4bdd9ed2fd9aa416f67b5b77d317b1471e`. Only the small dependency set in K1's lockfile was installed, in a task-owned temporary directory. [results.json](dependency-closures/results.json) records per-file hashes and aggregate package hashes for json-2-csv 5.5.0, deeks 3.1.0, and doc-path 4.1.0. It also records the static require graph from the package entry, including reverse-converter modules loaded at initialization.

Dub creates its formula-prefix Set at module initialization. json-2-csv initializes CommonJS export properties, loads constants and both converter factories, and loads utilities. Constants contain exported mutable option objects and arrays, including an undefined default. Utilities create a module-level regex and scalar limit. The TypeScript-emitted import-star and re-export helpers inspect descriptors and create getter descriptors. deeks loads its utilities and types re-export. doc-path creates exported function properties.

Converter invocation creates per-call options, regexes, and closures. Options include a field title map made with Object.create. doc-path's read path recursively follows dynamic keys; its separate write path mutates arguments. Those write helpers are not proof that the read-only CSV call mutates input, but they cannot be admitted without reachability and alias analysis. No module-level memoization cache was established by this inspection. Export objects, default option graphs, regex state, and Dub's Set still require analysis beyond the implemented scalar initializer rule.

## Compiler results and the smallest demonstrated blocker set

[probe.mjs](dependency-closures/probe.mjs) runs isolated stock `build --lib` profiles. Generated sources and archives remain in a temporary directory and are removed. There are no compiler changes or dynamic embedding tiers.

The actual json-2-csv runtime entry fails with **SC1010**, reporting an import that resolves only to declarations. A minimal raw CommonJS export probe fails with **SC0001**, because `exports` is not bound. The [patch ledger](scriptc-patches.md#dependency-closure-follow-up-stock-046) contains both minimal reproductions.

Dynamic JSON property lookup, a module-level Set, and callback plus regex replacement compile in isolated probes. They are not demonstrated compiler gaps. The Set rejection in the adapter is an effect-proof restriction.

SC1010 is the first demonstrated package-linking blocker. SC0001 demonstrates why renaming emitted JavaScript files to TypeScript cannot by itself produce a library closure. These are a minimal observed front-end blocker set, not an exhaustive minimal set for a fully linked CSV closure. Compilation has not reached that deeper closure, so no downstream SC codes are invented.

For scriptc to take the original package unchanged, it needs runtime JavaScript package resolution and sound CommonJS module initialization, exports, getter, and require semantics in static library mode. Alternatively, the adapter needs a verified linker for those semantics and checked types for the flattened JavaScript. After that, the adapter still needs allocation and effect proofs for option graphs, regexes, callbacks, and dynamic read paths. Additional compiler errors can only be measured after these steps.

## Broad input specialization remains conditional

No broad `object[]` boundary is enabled by this change. A sound future specialization can select a finite record schema from observed call arguments, compile that schema, and guard every call before native entry. It must reject Date instances, accessors, custom prototypes, symbols, functions, undefined, sparse arrays, cycles, and non-finite values. Strict JSON serialization already performs the plain-data check; it must run before any Date conversion or toJSON hook. The schema guard must check field presence, scalar types, array density, and nesting. Calls outside the schema execute original JS with the original arguments.

That guard is necessary but insufficient for this dependency. Native execution must also preserve key enumeration order, missing versus null, dynamic path interpretation, default options, callback selection, numeric formatting, Unicode, regex escaping, and the exact header and row separators. Valid extra fields can change CSV columns, so a specialization must reject extra keys or model them explicitly. Returning a string makes the oracle exact UTF-8 bytes. There is no tolerance, key sorting, CSV normalization, or Date-to-string coercion. Fallback cannot undo partial effects, which is why the transitive purity proof precedes this boundary work.

Because the linked CSV closure is neither certified nor compilable here, a schema dispatcher and native CSV parity or A/B would give misleading evidence. They are not shipped. The fuzzer adds an immutable helper closure and CSV-sensitive strings to the existing general corpus. This is synthetic coverage, not CSV dependency parity.

## Final coverage checkpoint

The final census and sampled coverage run use the K1 harness and original pinned handlers. Papermark was used only at this final checkpoint, with no native timing or tuning. The held-out accepted-kernel list is P3's existing correctness artifact.

[shares.json](dependency-closures/shares.json) and [profiles.json](dependency-closures/profiles.json) retain the loaded-host result and response hashes. Dub's CSV category is 61.1% at 100 rows and 62.0% at 1,000 rows, compared with K1's 58.9% and 61.4%. Its accepted share stays zero. Formatting remains blocked. These sampling differences establish no recovery or savings.

The accepted census stays at 32 for Dub and 23 for held-out Papermark. Umami remains disabled under its original strict-null configuration. Papermark's current category accounts for 61.4% and 67.5% in this recount. Those are sampled JS coverage shares, not native timings or gains from this change. Changes in denominator, GC, host load, and sampling explain why the shares are not fixed constants.

## Reproduction and validation

Use temporary node_modules links into `/Users/noah/code/next-scriptc`. Use Node 24.22.0. The dependency probe requires `K1_DEPS` to point at a temporary install from `research/coverage-baseline/deps-lock.json`.

```sh
node --test --test-concurrency=1 packages/next-scriptc/test/*.mjs
PROMOTION_FUZZ_CASES=20000 PROMOTION_FUZZ_SEED=20935 node scripts/promotion-fuzz.mjs
K1_DEPS=/tmp/next-scriptc-k1-deps node research/dependency-closures/probe.mjs
COVERAGE_OUTPUT=../dependency-closures node research/coverage-baseline/census.mjs
RUN_APPS=papermark,dub COVERAGE_ACCEPTED=research/optional-boundaries/heldout-correctness.json COVERAGE_OUTPUT=../dependency-closures node research/coverage-baseline/profile.mjs
```

Census artifacts retain accepted candidates and aggregate rejection counts rather than the full rejection log. Profiles retain summarized stacks without third-party source. The full adapter suite passes all 84 tests. A final focused rerun covers the closure and dispatcher after the resolver restrictions and scalar inlining. The extended seed 20935 run passes 300,000 inputs and 600,000 comparisons across 15 candidates. Every comparison is followed by a native-usability check. The fuzzer records 1,002,904 native successes and 197,096 fallbacks across measured and follow-up calls. Both Node 24 shim tests pass, including 113 HTTP parity requests. No Vercel operation, Docker operation, scriptc change, root README edit, or third-party source commit is part of this step.

Temporary package installations and dependency symlinks are removed after validation. The root README is unchanged.
