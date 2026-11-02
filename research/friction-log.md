# P1 new-user friction log

Run on 2026-11-03, macOS arm64. The README-only path does not deliver the planned automatic Next default. An ordinary scoring function is accepted by `report` but is never considered by the default Next build. Explicit native functions initially compile and then fail the default Turbopack build. The small loader fix below makes the packed production app build, start a native sidecar, and return the expected result. Nitro automatically compiles the same scoring function after helper permission repair. With `ar` unavailable it builds and serves JS successfully.

No promotion win or application speedup was established. One two-record request proves response correctness, not dispatch convergence. No policy or discovery acceptance rules changed.

## Method and limits

Initial knowledge came from `packages/next-scriptc/README.md`, `packages/scriptc-promote/README.md`, and the linked `examples/demo/README.md` compiler installation section. No source or research document was used to unblock the initial Next installation/build/report or explicit build attempt. The linked demo page was read, but research links were not followed. Source reads began after the corresponding failure: Nitro's README-only attempt ended when it offered no setup recipe; `packages/scriptc-promote/src/nitro.mjs` then supplied `scriptcNitro`, `modules`, and the node-server constraint. Next source was read after its initial scenario and explicit build failed. F1 therefore also records a source escape: had to read `packages/next-scriptc/src/functions/config.mjs:13` to learn that missing optional loader metadata breaks Turbopack; subsequent repair, repacking, and blocker probes are diagnostic follow-ups, not an uninterrupted blind run. Had to read `packages/next-scriptc/src/functions/build.mjs:30` to learn the undocumented automatic-promotion option. ROADMAP and the hill log were read for deliverable bookkeeping, not app setup.

Fresh consumer directories were `/tmp/nsc-p1/next`, `explicit`, `nitro`, `missing`, and `dev`. The Next template came from `pnpm dlx create-next-app@16.4.3 /tmp/nsc-p1/next --ts --app --no-tailwind --eslint --use-pnpm --src-dir --import-alias '@/*' --yes`. Explicit/dev used clean copies of that official scaffold, excluding `.next`, `.git`, and `node_modules`, with independent installs. Nitro came from `pnpm dlx giget nitro /tmp/nsc-p1/nitro`; missing used a clean copy with an independent install. These copies are a limitation versus invoking the scaffolder independently for every variant.

Both local packages were packed from this worktree with `pnpm --dir packages/<name> pack --pack-destination /tmp/nsc-p1/packs`. Consumers installed the tarballs, with a pnpm override pointing the wrapper's `scriptc-promote@0.0.0` dependency to the local core tarball. No registry copy of either local package was used. The GitHub installation command itself was not tested. No files or node_modules in the main checkout were used or changed. Workspace install used `--store-dir /tmp/nsc-p1/store`; consumer pnpm installs used the normal package store, never main-checkout links.

Production runs used Node 24.22.0, pnpm 11.1.3, Next 16.4.3, React 19.3.0, TypeScript 5.9.3, stock scriptc 0.4.6, and Nitro 2.13.5. The initial shell reported Node 26.13.0 but pnpm scripts resolved Node 23.10.0. Tests were rerun with the Node 24 installation prepended to PATH. That initial core run failed in a React Router fixture's npm dependency preparation (`isbot`, exit 127); the Node 24 rerun passed without changing the test or dependency. This is environment contamination, not a proven product regression.

The scoring fixture uses an Item interface (id, price, rating, sales, stock), WEIGHTS, clamp, an indexed loop, price/budget normalization, availability, rounding, and an array result. Explicit native follows the README's async signature and awaits the call in POST. There is no Zod dependency. HTTP payload:

```json
{"items":[{"id":1,"price":50,"rating":4,"sales":100,"stock":5},{"id":2,"price":150,"rating":5,"sales":900,"stock":0}],"budget":100}
```

Every text output block below is captured output. `[exit=...; elapsed=...s]` lines were appended by the runner using a monotonic clock. Time lost below is an approximate operator estimate, overlaps across parallel commands, and excludes normal dependency download time. Build times are single observations on a shared machine; tests/builds overlapped and these are not performance benchmarks. No browser, deployment, Docker, login, push, PR, issue, public post, secret, or compiler fork was used.

## Top 10 prioritized backlog

Effort is an engineering estimate, not a commitment. Fixed entries remain here to show their original priority.

| Priority | Finding | Proposed fix | Effort | State |
|---|---|---|---|---|
| 1 | F1: Default Turbopack rejects explicit native loader metadata | Strip absent optional metadata before passing JSON loader options; test exact round trip and packed build | Small, <1 day | Fixed here |
| 2 | F2: Planned automatic Next default is actually opt-in | Make a separately reviewed default-policy change and test ordinary unmarked route helpers; retain explicit off | Medium, 1–2 days | Open; policy deliberately unchanged; current option documented |
| 3 | F3: No adapter setup in core README | Add Nitro install/config/build/dev/report recipe, then separate tested recipes for all other adapters | Small per adapter, 1–2 days total | Nitro fixed; other adapters open |
| 4 | F4: Accepted report row does not prove compiled or running native | Add compiled artifact/build status and a supported live snapshot/report path | Medium, 2–4 days | Open; distinction documented |
| 5 | F5: Explicit native function is silently excluded by report | Distinguish explicit-native async functions from ordinary async handlers; report explicit extraction/build status without changing discovery eligibility | Medium, 1–2 days | Open |
| 6 | F6: Diagnostics point at generated code | Preserve original file/line mapping through extraction and compiler diagnostics; test imported helpers and indexed reads | Medium, 2–4 days | Open |
| 7 | F7: Extractor class failure has neither location nor repair advice | Add location and stable diagnostic/hint for unsupported reference, including class parameter properties; do not expand acceptance in this task | Small/medium, 1–2 days | Open |
| 8 | F8: Toolchain failure says “not a candidate” | Classify infrastructure vs code refusal, name missing tool, say explicitly that automatic JS fallback remains active; test missing ar/compiler | Small, 1 day | Open |
| 9 | F9: Native helper permissions recur in independent packed installs | Verify postinstall/cache behavior in a fresh external consumer; include repair hint on SC3004 permission failures | Medium, 1–2 days | Open; Nitro repair docs added |
| 10 | F10: Native testing and function counts unclear in dev/build output | Document build/start testing and add distinct function counts and a dev-JS notice | Small, 1 day | Docs fixed; messages open |

## Full friction log

| ID | Scenario and step | Expected | Happened and verbatim evidence below | Severity | Estimated time lost | Diagnosed root cause and proposed fix |
|---|---|---|---|---|---|---|
| F1 | 2, build marked scoring function | README `next build` succeeds after compilation | `explicit-build-retry` rejects loader serializability; webpack works; corrected packed Turbopack build works | blocker | 3 min | `packages/next-scriptc/src/functions/config.mjs:14` supplied undefined fields (notably promotionFile), while Next requires exact JSON equality. Normalize metadata; fixed with regression assertion. |
| F2 | 1, enable withScriptc and build | Automatic promotion considers normal compute code | `auto-build` only counts routes; `auto-report` accepts rank | confusing | 2 min | `packages/next-scriptc/src/functions/build.mjs:30` gates discovery on nativePromotion auto, and `packages/next-scriptc/src/options.mjs:42` preserves an absent option. Document current opt-in now; separately change default policy. |
| F3 | 3, find Nitro setup | Install and configure using that adapter's README | Original core README starts with framework list then “Inspect promotion coverage”; no install command, import, config, preset, or adapter link | blocker | 2 min | `packages/scriptc-promote/README.md:1` lacked integration instructions; source `src/nitro.mjs:4` was required to learn setup. Add recipe; fixed for Nitro. Source-assisted follow-up is not a successful README-only run. |
| F4 | 1 and 3, determine whether HTTP ran native | Supported command shows observed dispatch | `auto-report` accepts rank but explicitly says no running app is contacted. Nitro census proves compilation only | confusing | 2 min | `packages/scriptc-promote/src/report.mjs:58` is static, `packages/next-scriptc/src/functions/promotion-client.mjs:13` loads process-local dispatchers. Add supported live report; docs now explain limit. No runtime snapshot obtained in these apps. |
| F5 | 2, run report after successful native build | Explicit native rank appears in coverage | `explicit-report`: `excluded src/lib/rank.ts#rank`, zero accepted | confusing | 1 min | `packages/scriptc-promote/src/functions/promotion-discovery.mjs:43` excludes async functions; report mirrors automatic discovery (`src/report.mjs:54`). Add an explicit-native category. |
| F6 | 2, unchecked indexed access with noUncheckedIndexedAccess | Error points to edited rank.ts and suggests guard/tuple | `blocker-unchecked`: eight SC0001 errors at `.next/cache/scriptc-functions/module-0.ts:17:27` etc. Reason is understandable, location is generated, no remediation | confusing | 1 min | `packages/next-scriptc/src/functions/build.mjs:51` emits module copies and `:73` passes compiler diagnostics through. Preserve locations; suggest guarding item and using tuple weights or guarded entries. |
| F7 | 2, small class | A class-specific location and remedy if unsupported | `blocker-class`: `function rank: unsupported reference weight`; file provided, no line or hint | confusing | 1 min | `packages/scriptc-promote/src/functions/extract.mjs:28` fail omits position; `:97` generic identifier check catches constructor parameter property. Improve diagnostic only, leaving acceptance unchanged. |
| F8 | 4, PATH without native build tools | JS build/run with clear fallback message | `missing-path-retry`: SC3004 spawnSync ar ENOENT, “not a candidate rank”, census zero compiled, successful JS response | confusing | 1 min | `packages/scriptc-promote/src/functions/promotion-build.mjs:53` formats compiler infrastructure errors as candidate refusal. Classify missing tools and explicitly state fallback. |
| F9 | 2/3/4, independent consumer installs | Approved scriptc helpers execute | `explicit-build`, `nitro-build`, `missing-path` report Permission denied; `pnpm rebuild scriptc` repairs each. Forced fixed-tarball reinstall also needed repair | blocker with documented workaround | 2 min | Published scriptc helper permission/install lifecycle outside this repo. Adapter invokes bundled compiler via `packages/scriptc-promote/src/paths.mjs:8`; `promotion-build.mjs:47` and Next `functions/build.mjs:73` expose underlying failure. Exact upstream file/line not established: third-party source was not investigated. Add fresh-cache consumer gate and permission-specific recovery hint. |
| F10 | 5 and 2, dev/native local validation and counts | Clear way to test native, counts include functions | `dev-server` runs JS and accepts edit; no native activity. `fixed-build-retry` compiles one function but finishes “Built 0 native route(s) in 0 process(es)” | confusing | 1 min | `packages/next-scriptc/src/adapter.mjs:30` prepares only production builds, `:119` prints route-only summary. Document native build/start loop (fixed); add separate function summary/dev notice. |

### Additional observations and what worked

- Initial consumer `pnpm add` exits 1 for ignored scriptc builds but explicitly names `pnpm approve-builds`; the README approval and rebuild commands work. This is a recoverable package-manager gate, not an unexplained install refusal.
- `Map`, `Date`, `in`, and a helper with an optional parameter all reach “The program compiled” in the explicit async native path. Their default builds then hit F1. These probes do not establish equivalent acceptance in the automatic addon path, or broad support for these language features. No unsupported-feature error was invented for them.
- The class failure is specifically the normal parameter-property class in the fixture. It is not evidence that every class is rejected.
- Nitro's initial compiler refusal leaves the build usable. After repair, census says one eligible and one compiled; the running endpoint returns the expected scores. Its static report identifies rank and the route reference graph.
- Both Next and Nitro return exactly `{"scores":[545,0]}`. After the loader fix, Next production starts a native PID and the same endpoint succeeds. This demonstrates the explicit native execution path, not a speedup.
- The report clearly labels prediction limits, nearest misses, and route reachability. It is useful before building, even though it cannot answer runtime state.
- `next dev` starts with the directive present, makes no native compilation claim, and the result changes from 545 to 55 after editing the rounding scale. First/warm/edit client times are retained below. Development behavior matches the Next README.
- Nitro scaffolding warns about compatibilityDate; this is a framework warning, not a scriptc failure. The source-assisted fixture omitted it. No product fix is proposed for that warning.
- The forced tarball reinstall took 68.09s because it downloaded other platform artifacts. That was a tester validation choice, not normal install friction. The first dev launch was mistakenly issued from `/tmp/nsc-p1` and corrected to `/tmp/nsc-p1/dev`; that operator error is not counted as product friction.

## Reproduction fixtures

The original scoring module and blocker bodies below preserve the code used. POST in Next imports `rank` from `@/lib/rank`; explicit mode awaits it. Nitro imports it from `../lib/rank` in `server/api/rank.post.ts` and uses h3 `defineEventHandler` and `readBody`. Next config is exactly the README's `withScriptc({})`. Nitro follow-up uses `defineNitroConfig({srcDir:"server",imports:false,preset:"node-server",modules:[scriptcNitro()]})` and a strict ES2022/Bundler tsconfig. Sources are retained inline because temporary apps are removed at completion.

```ts
export interface Item {
  id: number;
  price: number;
  rating: number;
  sales: number;
  stock: number;
}
const WEIGHTS = [0.55, 0.3, 0.15];
function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}
export function rank(items: Item[], budget: number): number[] {
  const scores: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const quality = clamp(item.rating, 5) / 5;
    const demand = clamp(item.sales, 1000) / 1000;
    const value = 1 - clamp(item.price, budget) / budget;
    const available = item.stock > 0 ? 1 : 0;
    let score = quality * WEIGHTS[0];
    score += demand * WEIGHTS[1];
    score += value * WEIGHTS[2];
    score *= available;
    if (item.price > budget) score *= 0.5;
    scores.push(Math.round(score * 1000));
  }
  return scores;
}
```

Blocker runner (each variant replaces rank.ts, then the original is restored):

```python
from pathlib import Path
import subprocess,json
p=Path('/tmp/nsc-p1/explicit/src/lib/rank.ts'); original=p.read_text(); Path('/tmp/nsc-p1/explicit-rank.ts').write_text(original)
cases={
'unchecked': original.replace('    if (!item) continue;\n',''),
'map': 'export async function rank(items: number[], budget: number): Promise<number> { "use native"; const weights = new Map<number,number>([[1,2]]); return weights.get(budget) ?? 0; }',
'class': 'class Scorer { constructor(public weight: number) {} score(n: number): number { return n * this.weight; } }\nexport async function rank(items: number[], budget: number): Promise<number> { "use native"; return new Scorer(2).score(budget); }',
'date': 'export async function rank(items: number[], budget: number): Promise<number> { "use native"; return new Date(budget).getTime(); }',
'in': 'export async function rank(items: {rating: number}[], budget: number): Promise<number> { "use native"; let score = 0; for (const item of items) { if ("rating" in item) score += item.rating; } return score; }',
'optional': 'function adjust(n: number, weight?: number): number { return n * (weight ?? 1); }\nexport async function rank(items: number[], budget: number): Promise<number> { "use native"; return adjust(budget); }'
}
t=Path('/tmp/nsc-p1/explicit/tsconfig.json'); config=t.read_text()
for name,body in cases.items():
 p.write_text(body)
 if name=='unchecked':
  c=json.loads(config);c['compilerOptions']['noUncheckedIndexedAccess']=True;t.write_text(json.dumps(c))
 else:t.write_text(config)
 subprocess.run(['python3','/tmp/nsc-p1/run.py','blocker-'+name,'/tmp/nsc-p1/explicit','pnpm','exec','next','build'],stdout=subprocess.DEVNULL)
p.write_text(original); t.write_text(config)
```

## Captured output

Commands use `pnpm exec next build` unless the section names webpack, report, installation, or Nitro. HTTP calls use `curl -sS -X POST http://localhost:<port>/api/rank -H "content-type: application/json" --data-binary @/tmp/nsc-p1/payload.json`. Ports are 3141 ordinary Next, 3142 Nitro, 3143 explicit Next, 3144 dev, and 3145 missing-toolchain Nitro.

### consumer-install

```text
[WARN] deprecated eslint@9.39.5: This version is no longer supported. Please see https://eslint.org/version-support for other options.
Progress: resolved 1, reused 0, downloaded 0, added 0
Progress: resolved 398, reused 333, downloaded 2, added 0
Packages: +7 -1
+++++++-
Progress: resolved 416, reused 352, downloaded 2, added 5
Progress: resolved 416, reused 352, downloaded 2, added 7, done

dependencies:
+ next-scriptc 0.0.0
+ scriptc-promote 0.0.0

[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: scriptc@0.4.6

Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.

[exit=1; elapsed=3.91s]
```

### approve

```text
.../scriptc@0.4.6/node_modules/scriptc postinstall$ node scripts/install-native.mjs
.../scriptc@0.4.6/node_modules/scriptc postinstall: Done

[exit=0; elapsed=3.21s]
```

### rebuild

```text
.../scriptc@0.4.6/node_modules/scriptc postinstall$ node scripts/install-native.mjs
.../scriptc@0.4.6/node_modules/scriptc postinstall: Done

[exit=0; elapsed=0.93s]
```

### auto-build

```text
Lockfile is up to date, resolution step is skipped
Already up to date

Done in 516ms using pnpm v11.1.3
▲ Next.js 16.4.3 (Turbopack)
  Applying modifyConfig from next-scriptc
✓ Running next.config.ts took 292ms

  Creating an optimized production build ...
✓ Compiled successfully in 1549ms
  Running TypeScript ...
  Finished TypeScript in 1354ms ...
  Collecting page data using 6 workers ...
  Generating static pages using 6 workers (0/5) ...
  Generating static pages using 6 workers (1/5) 
  Generating static pages using 6 workers (2/5) 
  Generating static pages using 6 workers (3/5) 
✓ Generating static pages using 6 workers (5/5) in 328ms
  Finalizing page optimization ...
  Running onBuildComplete from next-scriptc
[next-scriptc] Built 0 native route(s) in 0 process(es).

Route (app)
┌ ○ /
├ ○ /_not-found
└ ƒ /api/rank


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand


[exit=0; elapsed=6.04s]
```

### auto-start

```text
▲ Next.js 16.4.3
- Local:         http://localhost:3141
- Network:       http://192.168.0.134:3141
✓ Ready in 236ms
  Applying modifyConfig from next-scriptc
✓ Running next.config.ts took 202ms
```

### auto-http

```text
{"scores":[545,0]}
```

### auto-report

```text
scriptc-promote coverage — next
7 files; 5 top-level callable bindings (4 exported)
4 considered; 3 diagnosed; 1 accepted; 1 silently excluded
Diagnostics are not a complete denominator; acceptance is not a speedup.
excluded             src/app/api/rank/route.ts#POST
rejected             src/app/layout.tsx#Layout — [next-scriptc] not a candidate Layout: [next-scriptc] /private/tmp/nsc-p1/next/src/app/layout.tsx: function Layout: React/JSX is unsupported
rejected             src/app/page.tsx#Page — [next-scriptc] not a candidate Page: [next-scriptc] /private/tmp/nsc-p1/next/src/app/page.tsx: function Page: React/JSX is unsupported
rejected             src/lib/rank.ts#clamp — [next-scriptc] not a candidate clamp: work: no loop, recursion, array callback or JSON parse
accepted             src/lib/rank.ts#rank
Route src/app/api/rank/route.ts#POST: src/app/api/rank/route.ts#POST, src/lib/rank.ts#clamp, src/lib/rank.ts#rank
Route src/app/page.tsx#Page: src/app/page.tsx#Page
Top blockers:
  2 × React/JSX is unsupported
    The existing extractor could not close and validate this function; see the exact diagnostic.
  1 × work: no loop, recursion, array callback or JSON parse
    No substantial compute pattern was found; small calls often cost more to cross the boundary.
Nearest misses (one emitted diagnostic, further blockers may exist): src/app/layout.tsx#Layout, src/app/page.tsx#Page, src/lib/rank.ts#clamp
Note: Discovery diagnostics are not a complete denominator. Async/generator handlers, directives, unused private functions and other early exclusions may be silent.
Note: Nearest misses have exactly one emitted diagnostic; discovery stops at the first failure, so fixing it may reveal others.
Note: Reachability is a conservative identifier-reference graph through local TypeScript-resolved symbols, not a request trace. Dynamic imports, framework magic, namespace property calls and dependency code may be missing; references may overcount calls.
Note: Static acceptance does not guarantee stock compiler acceptance or a speedup. No application config files are executed. Wrapped top-level callbacks count as one callable binding.
Note: Runtime state is process-local (dispatcher.snapshot()). No running app is contacted. Capture snapshots in the app for observed decisions.

[exit=0; elapsed=3.31s]
```

### explicit-build

```text
▲ Next.js 16.4.3 (Turbopack)
  Applying modifyConfig from next-scriptc
[next-scriptc] Compiling 1 native function(s)
/private/tmp/nsc-p1/explicit/.next/cache/scriptc-functions/entry.ts:1:1 - error SC3004: TypeScript server startup: Permission denied

1 error.

> Build error occurred
Error: [next-scriptc] Function compilation failed (exit 1). See scriptc diagnostics above.
    at ignore-listed frames

[exit=1; elapsed=7.43s]
```

### explicit-repair

```text
.../scriptc@0.4.6/node_modules/scriptc postinstall$ node scripts/install-native.mjs
.../scriptc@0.4.6/node_modules/scriptc postinstall: Done

[exit=0; elapsed=2.46s]
```

### explicit-build-retry

```text
▲ Next.js 16.4.3 (Turbopack)
  Applying modifyConfig from next-scriptc
[next-scriptc] Compiling 1 native function(s)
warning SC6101: 1 function that likely runs often uses untyped values, which runs slower than typed code:
  check (functions-runtime/json.ts:22): `descriptors` is `any`, in a loop
  hint: add types to compile these statically; see scriptc coverage --explain-dynamic

The program compiled. Adding types to these functions lets scriptc compile them to faster code.
/private/tmp/nsc-p1/explicit/.next/cache/scriptc-functions/functions
next-scriptc: listening on 127.0.0.1:47501
[next-scriptc] native functions → native PID 29336, port 47501
✓ Running next.config.ts took 5.0s

  Creating an optimized production build ...

> Build error occurred
Error: loader /private/tmp/nsc-p1/explicit/node_modules/.pnpm/next-scriptc@file+..+..+..+..+tmp+nsc-p1+packs+next-scriptc-0.0.0.tgz_next@16.4.3_@babe_49c46e72a7d736b1dd7b42781a4b85c3/node_modules/next-scriptc/src/functions/loader.mjs for match "*" does not have serializable options. Ensure that options passed are plain JavaScript objects and values.
    at ignore-listed frames

[exit=1; elapsed=6.56s]
```

### explicit-webpack

```text
▲ Next.js 16.4.3 (webpack)
  Applying modifyConfig from next-scriptc
[next-scriptc] Compiling 1 native function(s)
warning SC6101: 1 function that likely runs often uses untyped values, which runs slower than typed code:
  check (functions-runtime/json.ts:22): `descriptors` is `any`, in a loop
  hint: add types to compile these statically; see scriptc coverage --explain-dynamic

The program compiled. Adding types to these functions lets scriptc compile them to faster code.
/private/tmp/nsc-p1/explicit/.next/cache/scriptc-functions/functions
next-scriptc: listening on 127.0.0.1:47501
[next-scriptc] native functions → native PID 29952, port 47501
✓ Running next.config.ts took 1804ms

  Creating an optimized production build ...
✓ Compiled successfully in 2.9s
  Running TypeScript ...
  Finished TypeScript in 1011ms ...
  Collecting page data using 6 workers ...
  Generating static pages using 6 workers (0/5) ...
  Generating static pages using 6 workers (1/5) 
  Generating static pages using 6 workers (2/5) 
  Generating static pages using 6 workers (3/5) 
✓ Generating static pages using 6 workers (5/5) in 436ms
  Finalizing page optimization ...
  Collecting build traces ...
  Running onBuildComplete from next-scriptc
[next-scriptc] Built 0 native route(s) in 0 process(es).

Route (app)
┌ ○ /
├ ○ /_not-found
└ ƒ /api/rank


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand


[exit=0; elapsed=15.06s]
```

### blocker-unchecked

```text
▲ Next.js 16.4.3 (Turbopack)
  Applying modifyConfig from next-scriptc
[next-scriptc] Compiling 1 native function(s)
/private/tmp/nsc-p1/explicit/.next/cache/scriptc-functions/module-0.ts:17:27 - error SC0001: 'item' is possibly 'undefined'.

  16 |     const item = items[i];
  17 |     const quality = clamp(item.rating, 5) / 5;
     |                           ^~~~
  18 |     const demand = clamp(item.sales, 1000) / 1000;

/private/tmp/nsc-p1/explicit/.next/cache/scriptc-functions/module-0.ts:18:26 - error SC0001: 'item' is possibly 'undefined'.

  17 |     const quality = clamp(item.rating, 5) / 5;
  18 |     const demand = clamp(item.sales, 1000) / 1000;
     |                          ^~~~
  19 |     const value = 1 - clamp(item.price, budget) / budget;

/private/tmp/nsc-p1/explicit/.next/cache/scriptc-functions/module-0.ts:19:29 - error SC0001: 'item' is possibly 'undefined'.

  18 |     const demand = clamp(item.sales, 1000) / 1000;
  19 |     const value = 1 - clamp(item.price, budget) / budget;
     |                             ^~~~
  20 |     const available = item.stock > 0 ? 1 : 0;

/private/tmp/nsc-p1/explicit/.next/cache/scriptc-functions/module-0.ts:20:23 - error SC0001: 'item' is possibly 'undefined'.

  19 |     const value = 1 - clamp(item.price, budget) / budget;
  20 |     const available = item.stock > 0 ? 1 : 0;
     |                       ^~~~
  21 |     let score = quality * WEIGHTS[0];

/private/tmp/nsc-p1/explicit/.next/cache/scriptc-functions/module-0.ts:21:27 - error SC0001: Object is possibly 'undefined'.

  20 |     const available = item.stock > 0 ? 1 : 0;
  21 |     let score = quality * WEIGHTS[0];
     |                           ^~~~~~~~~~
  22 |     score += demand * WEIGHTS[1];

/private/tmp/nsc-p1/explicit/.next/cache/scriptc-functions/module-0.ts:22:23 - error SC0001: Object is possibly 'undefined'.

  21 |     let score = quality * WEIGHTS[0];
  22 |     score += demand * WEIGHTS[1];
     |                       ^~~~~~~~~~
  23 |     score += value * WEIGHTS[2];

/private/tmp/nsc-p1/explicit/.next/cache/scriptc-functions/module-0.ts:23:22 - error SC0001: Object is possibly 'undefined'.

  22 |     score += demand * WEIGHTS[1];
  23 |     score += value * WEIGHTS[2];
     |                      ^~~~~~~~~~
  24 |     score *= available;

/private/tmp/nsc-p1/explicit/.next/cache/scriptc-functions/module-0.ts:25:9 - error SC0001: 'item' is possibly 'undefined'.

  24 |     score *= available;
  25 |     if (item.price > budget) score *= 0.5;
     |         ^~~~
  26 |     scores.push(Math.round(score * 1000));

8 errors.

> Build error occurred
Error: [next-scriptc] Function compilation failed (exit 1). See scriptc diagnostics above.
    at ignore-listed frames

[exit=1; elapsed=3.89s]
```

### blocker-map

```text
▲ Next.js 16.4.3 (Turbopack)
  Applying modifyConfig from next-scriptc
[next-scriptc] Compiling 1 native function(s)
warning SC6101: 1 function that likely runs often uses untyped values, which runs slower than typed code:
  check (functions-runtime/json.ts:22): `descriptors` is `any`, in a loop
  hint: add types to compile these statically; see scriptc coverage --explain-dynamic

The program compiled. Adding types to these functions lets scriptc compile them to faster code.
/private/tmp/nsc-p1/explicit/.next/cache/scriptc-functions/functions
next-scriptc: listening on 127.0.0.1:47501
[next-scriptc] native functions → native PID 30750, port 47501
✓ Running next.config.ts took 3.2s

  Creating an optimized production build ...

> Build error occurred
Error: loader /private/tmp/nsc-p1/explicit/node_modules/.pnpm/next-scriptc@file+..+..+..+..+tmp+nsc-p1+packs+next-scriptc-0.0.0.tgz_next@16.4.3_@babe_49c46e72a7d736b1dd7b42781a4b85c3/node_modules/next-scriptc/src/functions/loader.mjs for match "*" does not have serializable options. Ensure that options passed are plain JavaScript objects and values.
    at ignore-listed frames

[exit=1; elapsed=4.83s]
```

### blocker-class

```text
▲ Next.js 16.4.3 (Turbopack)
  Applying modifyConfig from next-scriptc

> Build error occurred
Error: [next-scriptc] /private/tmp/nsc-p1/explicit/src/lib/rank.ts: function rank: unsupported reference weight
    at ignore-listed frames

[exit=1; elapsed=0.69s]
```

### blocker-date

```text
▲ Next.js 16.4.3 (Turbopack)
  Applying modifyConfig from next-scriptc
[next-scriptc] Compiling 1 native function(s)
warning SC6101: 1 function that likely runs often uses untyped values, which runs slower than typed code:
  check (functions-runtime/json.ts:22): `descriptors` is `any`, in a loop
  hint: add types to compile these statically; see scriptc coverage --explain-dynamic

The program compiled. Adding types to these functions lets scriptc compile them to faster code.
/private/tmp/nsc-p1/explicit/.next/cache/scriptc-functions/functions
next-scriptc: listening on 127.0.0.1:47501
[next-scriptc] native functions → native PID 30861, port 47501
✓ Running next.config.ts took 2.1s

  Creating an optimized production build ...

> Build error occurred
Error: loader /private/tmp/nsc-p1/explicit/node_modules/.pnpm/next-scriptc@file+..+..+..+..+tmp+nsc-p1+packs+next-scriptc-0.0.0.tgz_next@16.4.3_@babe_49c46e72a7d736b1dd7b42781a4b85c3/node_modules/next-scriptc/src/functions/loader.mjs for match "*" does not have serializable options. Ensure that options passed are plain JavaScript objects and values.
    at ignore-listed frames

[exit=1; elapsed=3.42s]
```

### blocker-in

```text
▲ Next.js 16.4.3 (Turbopack)
  Applying modifyConfig from next-scriptc
[next-scriptc] Compiling 1 native function(s)
warning SC6101: 1 function that likely runs often uses untyped values, which runs slower than typed code:
  check (functions-runtime/json.ts:22): `descriptors` is `any`, in a loop
  hint: add types to compile these statically; see scriptc coverage --explain-dynamic

The program compiled. Adding types to these functions lets scriptc compile them to faster code.
/private/tmp/nsc-p1/explicit/.next/cache/scriptc-functions/functions
next-scriptc: listening on 127.0.0.1:47501
[next-scriptc] native functions → native PID 30973, port 47501
✓ Running next.config.ts took 1976ms

  Creating an optimized production build ...

> Build error occurred
Error: loader /private/tmp/nsc-p1/explicit/node_modules/.pnpm/next-scriptc@file+..+..+..+..+tmp+nsc-p1+packs+next-scriptc-0.0.0.tgz_next@16.4.3_@babe_49c46e72a7d736b1dd7b42781a4b85c3/node_modules/next-scriptc/src/functions/loader.mjs for match "*" does not have serializable options. Ensure that options passed are plain JavaScript objects and values.
    at ignore-listed frames

[exit=1; elapsed=3.33s]
```

### blocker-optional

```text
▲ Next.js 16.4.3 (Turbopack)
  Applying modifyConfig from next-scriptc
[next-scriptc] Compiling 1 native function(s)
warning SC6101: 1 function that likely runs often uses untyped values, which runs slower than typed code:
  check (functions-runtime/json.ts:22): `descriptors` is `any`, in a loop
  hint: add types to compile these statically; see scriptc coverage --explain-dynamic

The program compiled. Adding types to these functions lets scriptc compile them to faster code.
/private/tmp/nsc-p1/explicit/.next/cache/scriptc-functions/functions
next-scriptc: listening on 127.0.0.1:47501
[next-scriptc] native functions → native PID 31043, port 47501
✓ Running next.config.ts took 2.0s

  Creating an optimized production build ...

> Build error occurred
Error: loader /private/tmp/nsc-p1/explicit/node_modules/.pnpm/next-scriptc@file+..+..+..+..+tmp+nsc-p1+packs+next-scriptc-0.0.0.tgz_next@16.4.3_@babe_49c46e72a7d736b1dd7b42781a4b85c3/node_modules/next-scriptc/src/functions/loader.mjs for match "*" does not have serializable options. Ensure that options passed are plain JavaScript objects and values.
    at ignore-listed frames

[exit=1; elapsed=3.36s]
```

### nitro-scaffold

```text
Progress: resolved 1, reused 0, downloaded 0, added 0
Packages: +1
+
Progress: resolved 1, reused 1, downloaded 0, added 1, done
✨ Successfully cloned `nitro` to `../../../../../../tmp/nsc-p1/nitro`
```

### nitro-build

```text
$ nitro build

[nitro]  WARN  Please add compatibilityDate: '2026-11-03' to the config file. Using 2024-04-03 as fallback.
       More info: https://nitro.build/deploy#compatibility-date

[nitro] ✔ Generated public .output/public
[nitro] ℹ Building Nitro Server (preset: node-server, compatibility date: ``)
[next-scriptc] not a candidate clamp: work: no loop, recursion, array callback or JSON parse
[next-scriptc] not a candidate rank: /var/folders/4x/9xsch0y129j47fl92k4zx9cm0000gn/T/scriptc-vite-Pclxww/profile.json:1:1 - error SC3004: TypeScript server startup: Permission denied

1 error.

[scriptc-promote] census: 1 eligible, 0 compiled
[nitro] ✔ Nitro Server built
  ├─ .output/server/chunks/nitro/nitro.mjs (153 kB) (37.7 kB gzip)
  ├─ .output/server/chunks/routes/api/rank.post.mjs (1.17 kB) (552 B gzip)
  ├─ .output/server/chunks/routes/index.mjs (637 B) (380 B gzip)
  ├─ .output/server/index.mjs (353 B) (204 B gzip)
  └─ .output/server/package.json (113 B) (105 B gzip)
Σ Total size: 155 kB (38.9 kB gzip)
[nitro] ✔ You can preview this build using node .output/server/index.mjs

[exit=0; elapsed=4.50s]
```

### nitro-build-retry

```text
$ nitro build

[nitro]  WARN  Please add compatibilityDate: '2026-11-03' to the config file. Using 2024-04-03 as fallback.
       More info: https://nitro.build/deploy#compatibility-date

[nitro] ✔ Generated public .output/public
[nitro] ℹ Building Nitro Server (preset: node-server, compatibility date: ``)
[next-scriptc] not a candidate clamp: work: no loop, recursion, array callback or JSON parse
[scriptc-promote] census: 1 eligible, 1 compiled
[nitro] ✔ Nitro Server built
  ├─ .output/server/chunks/nitro/nitro.mjs (153 kB) (37.7 kB gzip)
  ├─ .output/server/chunks/routes/api/rank.post.mjs (27.9 kB) (9.87 kB gzip)
  ├─ .output/server/chunks/routes/index.mjs (637 B) (380 B gzip)
  ├─ .output/server/index.mjs (353 B) (204 B gzip)
  ├─ .output/server/package.json (113 B) (105 B gzip)
  ├─ .output/server/scriptc-promotion/encodings.json (98 B) (106 B gzip)
  ├─ .output/server/scriptc-promotion/ids.json (24 B) (44 B gzip)
  └─ .output/server/scriptc-promotion/promotion.node (1.33 MB) (637 kB gzip)
Σ Total size: 1.52 MB (686 kB gzip)
[nitro] ✔ You can preview this build using node .output/server/index.mjs

[exit=0; elapsed=5.74s]
```

### nitro-http

```text
{"scores":[545,0]}
```

### nitro-report

```text
scriptc-promote coverage — nitro
4 files; 4 top-level callable bindings (3 exported)
2 considered; 1 diagnosed; 1 accepted; 2 silently excluded
Diagnostics are not a complete denominator; acceptance is not a speedup.
excluded             server/api/rank.post.ts#default
rejected             server/lib/rank.ts#clamp — [next-scriptc] not a candidate clamp: work: no loop, recursion, array callback or JSON parse
accepted             server/lib/rank.ts#rank
excluded             server/routes/index.ts#default
Route server/api/rank.post.ts#default: server/api/rank.post.ts#default, server/lib/rank.ts#clamp, server/lib/rank.ts#rank
Route server/routes/index.ts#default: server/routes/index.ts#default
Top blockers:
  1 × work: no loop, recursion, array callback or JSON parse
    No substantial compute pattern was found; small calls often cost more to cross the boundary.
Nearest misses (one emitted diagnostic, further blockers may exist): server/lib/rank.ts#clamp
Note: Discovery diagnostics are not a complete denominator. Async/generator handlers, directives, unused private functions and other early exclusions may be silent.
Note: Nearest misses have exactly one emitted diagnostic; discovery stops at the first failure, so fixing it may reveal others.
Note: Reachability is a conservative identifier-reference graph through local TypeScript-resolved symbols, not a request trace. Dynamic imports, framework magic, namespace property calls and dependency code may be missing; references may overcount calls.
Note: Static acceptance does not guarantee stock compiler acceptance or a speedup. No application config files are executed. Wrapped top-level callbacks count as one callable binding.
Note: Runtime state is process-local (dispatcher.snapshot()). No running app is contacted. Capture snapshots in the app for observed decisions.

[exit=0; elapsed=1.82s]
```

### missing-path

```text

[nitro]  WARN  Please add compatibilityDate: '2026-11-03' to the config file. Using 2024-04-03 as fallback.
       More info: https://nitro.build/deploy#compatibility-date

[nitro] ✔ Generated public .output/public
[nitro] ℹ Building Nitro Server (preset: node-server, compatibility date: ``)
[next-scriptc] not a candidate clamp: work: no loop, recursion, array callback or JSON parse
[next-scriptc] not a candidate rank: /var/folders/4x/9xsch0y129j47fl92k4zx9cm0000gn/T/scriptc-vite-9ikmN6/profile.json:1:1 - error SC3004: TypeScript server startup: Permission denied

1 error.

[scriptc-promote] census: 1 eligible, 0 compiled
[nitro] ✔ Nitro Server built
  ├─ .output/server/chunks/nitro/nitro.mjs (153 kB) (37.7 kB gzip)
  ├─ .output/server/chunks/routes/api/rank.post.mjs (1.17 kB) (552 B gzip)
  ├─ .output/server/chunks/routes/index.mjs (637 B) (380 B gzip)
  ├─ .output/server/index.mjs (353 B) (204 B gzip)
  └─ .output/server/package.json (113 B) (105 B gzip)
Σ Total size: 155 kB (38.9 kB gzip)
[nitro] ✔ You can preview this build using node .output/server/index.mjs

[exit=0; elapsed=4.48s]
```

### missing-path-retry

```text

[nitro]  WARN  Please add compatibilityDate: '2026-11-03' to the config file. Using 2024-04-03 as fallback.
       More info: https://nitro.build/deploy#compatibility-date

[nitro] ✔ Generated public .output/public
[nitro] ℹ Building Nitro Server (preset: node-server, compatibility date: ``)
[next-scriptc] not a candidate clamp: work: no loop, recursion, array callback or JSON parse
[next-scriptc] not a candidate rank: /var/folders/4x/9xsch0y129j47fl92k4zx9cm0000gn/T/scriptc-vite-2k9Ch1/profile.json:1:1 - error SC3004: spawnSync ar ENOENT

1 error.

[scriptc-promote] census: 1 eligible, 0 compiled
[nitro] ✔ Nitro Server built
  ├─ .output/server/chunks/nitro/nitro.mjs (153 kB) (37.7 kB gzip)
  ├─ .output/server/chunks/routes/api/rank.post.mjs (1.17 kB) (552 B gzip)
  ├─ .output/server/chunks/routes/index.mjs (637 B) (380 B gzip)
  ├─ .output/server/index.mjs (353 B) (204 B gzip)
  └─ .output/server/package.json (113 B) (105 B gzip)
Σ Total size: 155 kB (38.9 kB gzip)
[nitro] ✔ You can preview this build using node .output/server/index.mjs

[exit=0; elapsed=7.39s]
```

### missing-start

```text
Listening on http://[::]:3145
```

### missing-http

```text
{"scores":[545,0]}
```

### fixed-build

```text
▲ Next.js 16.4.3 (Turbopack)
  Applying modifyConfig from next-scriptc
[next-scriptc] Compiling 1 native function(s)
/private/tmp/nsc-p1/explicit/.next/cache/scriptc-functions/entry.ts:1:1 - error SC3004: TypeScript server startup: Permission denied

1 error.

> Build error occurred
Error: [next-scriptc] Function compilation failed (exit 1). See scriptc diagnostics above.
    at ignore-listed frames

[exit=1; elapsed=5.41s]
```

### fixed-build-retry

```text
▲ Next.js 16.4.3 (Turbopack)
  Applying modifyConfig from next-scriptc
[next-scriptc] Compiling 1 native function(s)
warning SC6101: 1 function that likely runs often uses untyped values, which runs slower than typed code:
  check (functions-runtime/json.ts:22): `descriptors` is `any`, in a loop
  hint: add types to compile these statically; see scriptc coverage --explain-dynamic

The program compiled. Adding types to these functions lets scriptc compile them to faster code.
/private/tmp/nsc-p1/explicit/.next/cache/scriptc-functions/functions
next-scriptc: listening on 127.0.0.1:47501
[next-scriptc] native functions → native PID 33580, port 47501
✓ Running next.config.ts took 4.5s

  Creating an optimized production build ...
✓ Compiled successfully in 1009ms
  Running TypeScript ...
  Finished TypeScript in 639ms ...
  Collecting page data using 6 workers ...
  Generating static pages using 6 workers (0/5) ...
  Generating static pages using 6 workers (1/5) 
  Generating static pages using 6 workers (2/5) 
  Generating static pages using 6 workers (3/5) 
✓ Generating static pages using 6 workers (5/5) in 242ms
  Finalizing page optimization ...
  Running onBuildComplete from next-scriptc
[next-scriptc] Built 0 native route(s) in 0 process(es).

Route (app)
┌ ○ /
├ ○ /_not-found
└ ƒ /api/rank


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand


[exit=0; elapsed=8.00s]
```

### explicit-start

```text
▲ Next.js 16.4.3
- Local:         http://localhost:3143
- Network:       http://192.168.0.134:3143
✓ Ready in 88ms
  Applying modifyConfig from next-scriptc
next-scriptc: listening on 127.0.0.1:47501
[next-scriptc] native functions → native PID 33602, port 47501
✓ Running next.config.ts took 306ms
```

### explicit-http

```text
{"scores":[545,0]}
```

### explicit-report

```text
scriptc-promote coverage — next
7 files; 5 top-level callable bindings (4 exported)
3 considered; 3 diagnosed; 0 accepted; 2 silently excluded
Diagnostics are not a complete denominator; acceptance is not a speedup.
excluded             src/app/api/rank/route.ts#POST
rejected             src/app/layout.tsx#Layout — [next-scriptc] not a candidate Layout: [next-scriptc] /private/tmp/nsc-p1/explicit/src/app/layout.tsx: function Layout: React/JSX is unsupported
rejected             src/app/page.tsx#Page — [next-scriptc] not a candidate Page: [next-scriptc] /private/tmp/nsc-p1/explicit/src/app/page.tsx: function Page: React/JSX is unsupported
rejected             src/lib/rank.ts#clamp — [next-scriptc] not a candidate clamp: work: no loop, recursion, array callback or JSON parse
excluded             src/lib/rank.ts#rank
Route src/app/api/rank/route.ts#POST: src/app/api/rank/route.ts#POST, src/lib/rank.ts#clamp, src/lib/rank.ts#rank
Route src/app/page.tsx#Page: src/app/page.tsx#Page
Top blockers:
  2 × React/JSX is unsupported
    The existing extractor could not close and validate this function; see the exact diagnostic.
  1 × work: no loop, recursion, array callback or JSON parse
    No substantial compute pattern was found; small calls often cost more to cross the boundary.
Nearest misses (one emitted diagnostic, further blockers may exist): src/app/layout.tsx#Layout, src/app/page.tsx#Page, src/lib/rank.ts#clamp
Note: Discovery diagnostics are not a complete denominator. Async/generator handlers, directives, unused private functions and other early exclusions may be silent.
Note: Nearest misses have exactly one emitted diagnostic; discovery stops at the first failure, so fixing it may reveal others.
Note: Reachability is a conservative identifier-reference graph through local TypeScript-resolved symbols, not a request trace. Dynamic imports, framework magic, namespace property calls and dependency code may be missing; references may overcount calls.
Note: Static acceptance does not guarantee stock compiler acceptance or a speedup. No application config files are executed. Wrapped top-level callbacks count as one callable binding.
Note: Runtime state is process-local (dispatcher.snapshot()). No running app is contacted. Capture snapshots in the app for observed decisions.

[exit=0; elapsed=1.56s]
```

### dev-server

```text
▲ Next.js 16.4.3 (Turbopack)
- Local:         http://localhost:3144
- Network:       http://192.168.0.134:3144
✓ Ready in 320ms
  Applying modifyConfig from next-scriptc
✓ Running next.config.ts took 2.4s

 POST /api/rank 200 in 59ms (next.js: 46ms, application-code: 14ms)
 POST /api/rank 200 in 6ms (next.js: 1.8ms, application-code: 4ms)
 POST /api/rank 200 in 7ms (next.js: 0.9ms, application-code: 6ms)
```

### dev-http

```text
first: {"scores":[545,0]} [exit=0; elapsed=0.370s]
warm: {"scores":[545,0]} [exit=0; elapsed=0.045s]
edit: {"scores":[55,0]} [exit=0; elapsed=0.058s]
```

### dev-production-build

```text
▲ Next.js 16.4.3 (Turbopack)
  Applying modifyConfig from next-scriptc
[next-scriptc] Compiling 1 native function(s)
warning SC6101: 1 function that likely runs often uses untyped values, which runs slower than typed code:
  check (functions-runtime/json.ts:22): `descriptors` is `any`, in a loop
  hint: add types to compile these statically; see scriptc coverage --explain-dynamic

The program compiled. Adding types to these functions lets scriptc compile them to faster code.
/private/tmp/nsc-p1/dev/.next/cache/scriptc-functions/functions
next-scriptc: listening on 127.0.0.1:41916
[next-scriptc] native functions → native PID 33810, port 41916
✓ Running next.config.ts took 5.4s

  Creating an optimized production build ...
✓ Compiled successfully in 1077ms
  Running TypeScript ...
  Finished TypeScript in 738ms ...
  Collecting page data using 6 workers ...
  Generating static pages using 6 workers (0/5) ...
  Generating static pages using 6 workers (1/5) 
  Generating static pages using 6 workers (2/5) 
  Generating static pages using 6 workers (3/5) 
✓ Generating static pages using 6 workers (5/5) in 242ms
  Finalizing page optimization ...
  Running onBuildComplete from next-scriptc
[next-scriptc] Built 0 native route(s) in 0 process(es).

Route (app)
┌ ○ /
├ ○ /_not-found
└ ƒ /api/rank


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand


[exit=0; elapsed=8.90s]
```

### dev-production-rebuild

```text
▲ Next.js 16.4.3 (Turbopack)
  Applying modifyConfig from next-scriptc
[next-scriptc] Compiling 1 native function(s)
warning SC6101: 1 function that likely runs often uses untyped values, which runs slower than typed code:
  check (functions-runtime/json.ts:22): `descriptors` is `any`, in a loop
  hint: add types to compile these statically; see scriptc coverage --explain-dynamic

The program compiled. Adding types to these functions lets scriptc compile them to faster code.
/private/tmp/nsc-p1/dev/.next/cache/scriptc-functions/functions
next-scriptc: listening on 127.0.0.1:41916
[next-scriptc] native functions → native PID 33898, port 41916
✓ Running next.config.ts took 1867ms

  Creating an optimized production build ...
✓ Compiled successfully in 296ms
  Running TypeScript ...
  Finished TypeScript in 705ms ...
  Collecting page data using 6 workers ...
  Generating static pages using 6 workers (0/5) ...
  Generating static pages using 6 workers (1/5) 
  Generating static pages using 6 workers (2/5) 
  Generating static pages using 6 workers (3/5) 
✓ Generating static pages using 6 workers (5/5) in 236ms
  Finalizing page optimization ...
  Running onBuildComplete from next-scriptc
[next-scriptc] Built 0 native route(s) in 0 process(es).

Route (app)
┌ ○ /
├ ○ /_not-found
└ ƒ /api/rank


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand


[exit=0; elapsed=4.41s]
```

## Small fixes and validation

The only runtime code change normalizes the Next function loader metadata to JSON before handing it to either bundler. It does not alter function bodies, promotion policy, candidate acceptance, or dispatch decisions. The existing path-condition test now verifies that both generated loader items survive an exact JSON round trip while retaining module hash and port. A repacked external consumer builds with default Turbopack and starts a native function sidecar successfully. The initial post-reinstall permission failure remains in the evidence; the successful run follows `pnpm rebuild scriptc`.

Package README changes add Nitro setup, current Next auto opt-in, report invocation with pnpm exec, toolchain repair, and production build/start testing. The documented Nitro config was exercised in the source-assisted consumer. Other adapters were not tested or documented by inference.

Both required package suites pass under Node 24.22.0. No tests were skipped beyond the core suite's two existing Nuxt/TanStack skips. These suites include existing native integration tests. This task made no deploy calls.

`next-tests-final` (`pnpm test` in its package):

```text
✔ bootstrap starts one shared child before the launcher and preserves exports and bundling groups (495.73475ms)
✔ Vercel completion publishes cached promotion before the output adapter and bundles traced Node functions (14.118917ms)
ℹ tests 98
ℹ suites 0
ℹ pass 98
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 59869.720584
```

`core-tests` (`pnpm test` in its package):

```text
✔ vite: client isolation, native SSR, grouped rewrites and relocated artifacts (3393.606459ms)
✔ dev and webworker targets disable all promotion hooks (0.238708ms)
ℹ tests 36
ℹ suites 0
ℹ pass 34
ℹ fail 0
ℹ cancelled 0
ℹ skipped 2
ℹ todo 0
ℹ duration_ms 69910.727417
```

Cleanup: temporary consumer apps, local tarballs, and the task-specific install store were removed after preserving the evidence here. Task-owned servers and the explicit compiler checker were stopped. Workspace dependencies remain installed for review. Root README and the main checkout were untouched.
