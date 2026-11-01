# Closed records cannot be certified from the current layout alone

2026-11-01. Stop at the hypothesis gate. Static library mode accepts operations that open typed values, and existing metadata does not preserve all of their effects. A check of the current layout or capsule cannot certify the original JavaScript value graph. No compiler facility or adapter opt-in was implemented. Production keeps the strict serializer and stock scriptc 0.4.6. The local fork diagnostic commit is `2ff495f8cc9fb79d37cd222e9a68ea7456916cd6`. This finding does not prove that a new persistent mutation certificate is impossible.

## Investigation boundary

Fetched `upstream` in `/Users/noah/code/scriptc-fork` and created `/Users/noah/code/scriptc-wt/closed-records`, branch `next-scriptc/closed-records`, directly from upstream `f606a3bd83c600cba474b12c3f462ecd4033071a`. The main checkout and `/Users/noah/scriptc` were not edited. Existing dependencies, LLVM helper, and ABI 48 runtime artifacts were reused. The focused runner uses the new worktree's compiler source, copies the existing runtime pack, and rebuilds its release and library-release `scr_json.c` default and dynamic-tier variants from the new worktree. Other runtime objects and vendor archives remain those of the existing pack. This is a focused reproduction with a private mixed-source pack, not a complete rebuilt upstream distribution or a full gate.

The retained [raw outputs](closed-records-parity.json) compare Node 24.22.0, a release executable, and a static library called by a C host on Darwin arm64. Both native outputs agree with each other and disagree with Node. All three processes exit successfully. The runner exits 1 to report the parity failure. The program has no Node island or Docker dependency. The same gaps also appeared before rebuilding the private JSON runtime units.

## What scriptc stores

The following source paths refer to the fork at the upstream revision above.

- `packages/compiler/src/backend/llvm/record-sources.ts` describes closed declared-field record layouts and the separate retained source for undeclared keys. Native layouts have fields and presence/order bookkeeping, rather than an ordinary JavaScript descriptor table.
- `packages/runtime/src/scr_dyn.h`, `ScrDynTypedRecordOps`, supplies per-shape `has`, `get`, optional `set`, a `fixed` field-presence promise, and an order-table `select` hook. `fixed` does not promise plain prototypes, ordinary descriptors, or absence of symbols. The hooks exclude integer-like field names and `__proto__`; they are not a universal own-key-order contract.
- `packages/runtime/src/scr_json.c`, `scr_dyn_typed_ref_new`, interns capsules by native pointer, adapters, and type key. A capsule carries its own `materialized` checked view and cast list. `scr_dyn_typed_ref_materialize` snapshots native fields and merges retained extras. Prototype and symbol state are copied from the cached view. Reflection such as `scr_dyn_get_prototype` materializes this view, which explains E1's repeated work.
- `scr_dyn_set_prototype` changes the capsule's materialized view. `scr_dyn_define_property` changes that view and invokes its commit adapter. The generated commit helper performs a checked conversion back to the native layout and swaps field storage. That conversion can evaluate a getter. Later materialization can expose an ordinary data field instead of the original accessor.
- `scr_record_source_note` retains a source when it finds undeclared string keys or a different key order. Its early decision walks string entries. Prototype and symbol changes alone do not force a retained source. Its handling of declared entries does not certify descriptor fidelity.
- Capsule lifetime differs from native object lifetime. `scr_typed_ref_forget` removes a disposed capsule from the interning table. The small parking ring retains only capsules without a materialized view, casts, prototype, or symbol state. Attaching a flag only to the currently boxed capsule would not provide a persistent mutation history for the native referent.
- `packages/runtime/src/scr_array.h`, `ScrArr`, stores `len`, `cap`, element kind, flags, and `filled`, a lower bound on the hole-free prefix. State bytes and sparse storage distinguish holes and present values. `ScrArrExt` carries extra numeric properties, metadata, and subclass information. This provides useful density checks, but says nothing by itself about symbol or prototype state held in a capsule view.
- `scr_json_live_container` already avoids snapshots for some bound arrays and records. This is an ordinary JSON optimization: JSON ignores hidden properties and symbols, accepts holes, and can invoke conversion hooks. Its predicate cannot establish the adapter's stricter contract.

## Required cases and observed behavior

Each mutation helper accepts `unknown` or `any`; its caller retains a typed record or array and passes it to a separate inspection helper afterward. All cases compile in static library mode. The fixture reports own names, symbol count, null-prototype status, the descriptor kind of `n`, and JSON bytes.

| Required case | Node | Native executable and library | Consequence for a certificate |
| --- | --- | --- | --- |
| Hidden string via `defineProperty` | Own names include `hidden` | Same in this probe | Must reject closure or take strict fallback even though JSON omits it |
| `setPrototypeOf(v, null)` | Null prototype survives | Later inspection reports a non-null prototype | Current layout/capsule lacks the needed history across this crossing |
| Hidden record symbol | Symbol count 1 | Symbol count 0 | A later zero-symbol check cannot certify absence in the original value |
| Getter replaces `n` | Descriptor getter is a function, JSON reads 7 | Descriptor getter is absent, JSON reads 7 | Field value parity does not prove data-property safety; conversion has already evaluated the getter |
| `a.length = 1` on an empty typed array | Own names only `length`, JSON `[null]` | Same | Density metadata is useful; a strict result must still refuse holes |
| Extra enumerable field through `any` | Own names and JSON include `extra` | Same in this probe | Typed field projection would be wrong; preserve extras through fallback |
| Typed-to-erased mutation | Changes remain visible through subsequent aliases | Several facts above disappear | Static library mode does not reject every opening operation or retain an authoritative open representation |
| Hidden array symbol | Symbol count 1 | Symbol count 0 | Confirms E1's array-symbol issue beyond stock 0.4.6 |
| `{n:-0}` | JSON `{"n":0}` | Same | Preserve JSON canonicalization; never throw from a new native lane to refuse this value |

This probe does not claim complete parity for hidden string descriptors or extra keys on all conversion paths. It establishes the listed failures on one accepted path. Ordinary JSON bytes are identical for these cases despite the lost reflection facts, so canonical-byte shadows cannot establish closure.

The adapter's `json.ts` requires plain prototypes, enumerable data descriptors, no symbols, dense arrays, finite numbers, and no active cycles before it calls the typed encoder. Node's strict path rejects the null prototype, symbols, accessor, hidden string property, and holes. Existing native conversions can erase some of those reasons before strict validation. Keeping the current serializer avoids a new unchecked optimization, but does not fix those pre-existing compiler gaps.

## Why the small facility stops here

A predicate such as "typed record with no materialized view" would accept a freshly boxed native value after an earlier view disappeared. The failed cases show why that predicate is unsound. Inspecting the current view more efficiently cannot recover a discarded symbol, prototype, or accessor. A one-pass encoder cannot recover them either. The runtime must retain that information, or conservatively remember that the native identity was exposed to an operation that could change it, before the conversion loses it.

A possible follow-up design places sticky open state on native identity, rather than on a temporary capsule. It must cover descriptors, prototype and symbol operations, property assignment and deletion, checked casts, narrowing/source links, aliases, copies that represent the same JS identity, and array metadata. It must invalidate before descriptor conversion can invoke user code. At the graph walk, it must check children, finite numbers, cycles, actual key order, and array density. Shared references must remain legal. Dynamic or unknown provenance must return "not closed" without invoking getters or trapping. A clean flag is useful only with an exhaustive construction and mutation proof.

That is new lifetime and conversion machinery, not a query over an existing certificate. A conservative whole-program construction proof could qualify a smaller subset, but this investigation did not establish such a proof for the promoted workload. No sound cheap implementation was established, so the requested stop condition applies. There is no experimental adapter flag or supported closed-record build to enable on this branch. The existing `specializeResults:true` experiment remains unchanged and disabled by default.

## Reproduce against the fork source

The fork branch contains `tests/fixtures/closed-records/{probe.ts,main.ts,profile.json,host.c,run.mts}` and a README. These are diagnostic fixtures outside automatic corpus discovery because their current Node parity fails. They must become passing corpus tests, with frontend baselines and corpus costs, when the underlying semantics are fixed. No failing automatic corpus test or fake passing assertion was added.

This host reuses dependencies through these symlinks in the new worktree only:

```sh
cd /Users/noah/code/scriptc-wt/closed-records
ln -s /Users/noah/code/scriptc-fork/node_modules node_modules
ln -s /Users/noah/code/scriptc-fork/packages/compiler/node_modules packages/compiler/node_modules
```

Skip the `ln` commands if the links already exist. Run the source compiler with the existing helper and a private runtime copy:

```sh
CMAKE_BUILD_PARALLEL_LEVEL=2 SCRIPTC_TEST_WORKERS=2 \
SCRIPTC_RUNTIME_PACK=/Users/noah/code/scriptc-fork/packages/runtime-darwin-arm64 \
SCRIPTC_LLVM_PACKAGE=/Users/noah/code/scriptc-fork/packages/llvm-darwin-arm64 \
/Users/noah/.local/share/fnm/node-versions/v24.22.0/installation/bin/node \
--import /Users/noah/code/scriptc-fork/node_modules/tsx/dist/loader.mjs \
tests/fixtures/closed-records/run.mts > /tmp/closed-records-parity.json
```

Expected exit is 1 with `parity:false`. The JSON includes complete Node, executable, and library output. The runner copies the pack, rebuilds four JSON objects sequentially with Clang and the manifest's variant defines, updates only their size and SHA-256 entries, compiles the program and library from worktree source, links the C host, and deletes its private pack, cache, IR, archives, and binaries in `finally`. The original pack is read only. Other runtime units are reused, as stated above. Do not point the stock ABI 47 compiler at this ABI 48 pack.

Initial exploratory setup failures were a missing assumed Node path and a temporary `.ts` runner parsed as CommonJS. The retained runner uses `.mts` and the verified Node 24 path. Rebuilt JSON units emit existing const-qualification warnings. The Node fixture emits a module-type warning on stderr; the retained comparison records stdout. It is not a complete stderr parity gate. The fixture sources are excluded from the root lint/format scope; formatting was applied through the formatter's stdin mode without changing repository exclusions.

## Measurement and resources

No strict-versus-new A/B was run because there is no new sound encoder to time. The 0.01–0.05 ms target is untested. E1 and V1's existing loaded-host timings remain prior evidence, not measurements of this branch. This host was treated as loaded throughout. No CPU improvement, calibrated prediction, or hosted result is claimed.

Only focused source compilation and differential diagnosis ran. No full suite, sanitizer gate, Docker command, container interaction, stand-in run, Vercel call, push, or PR occurred. Builds used at most two jobs, with the retained runner building sequentially. Root `README.md` was not edited.

Free disk from `df -h .` was 9.0 GiB before work and 13 GiB after cleanup. Concurrent work affects those readings, so the difference is not attributed to this task. All exploratory private packs, archives, binaries, IR, and task caches were removed. The isolated fork worktree and committed source fixtures remain; dependency symlinks created for the run were removed. Both the fork worktree and the original fork checkout report clean Git status.
