# P1b friction fixes

2026-11-03. Follow-up to [P1](friction-log.md) and hill 51. Changes are local to
`t3/promotion-diagnostics-default`. No application speedup is claimed.

## Changes and verbatim examples

F2 changes the absent Next Node option to `nativePromotion: "auto"`.
Explicit `"auto"` and `"off"` keep their behavior; Cloudflare defaults to off and
retains static verified dispatch. `withScriptc({}, { nativePromotion: "off" })`
disables discovery. Vite, SvelteKit, Astro, React Router, Nitro, and TanStack
already enable discovery in supported production server builds; none needed a
default change. Dispatcher thresholds, discovery acceptance, and shadow policy
are unchanged.

Before, P1's default unmarked scoring build never considered rank and reported:

```text
[next-scriptc] Built 0 native route(s) in 0 process(es).
```

After, the same scoring source in the fresh packed Next consumer, without an
option, compiles successfully. These are consecutive captured summary lines:

```text
[next-scriptc] Built 1 native function(s) in 1 module(s).
[next-scriptc] Built 0 native route(s) in 0 process(es).
```

F6 preserves extraction offsets and Babel original locations through imported
closure flattening. Opaque type edits retain an offset map. Compiler diagnostics
translate generated module positions to original files and add repair hints;
compiler SC codes are preserved. Generated context snippets are removed so their
line labels cannot contradict the translated location. The regression tests
cover an indexed read and a flattened imported helper.

Before, from P1:

```text
/private/tmp/nsc-p1/explicit/.next/cache/scriptc-functions/module-0.ts:17:27 - error SC0001: 'item' is possibly 'undefined'.
```

After, from the packed consumer's deliberately broken explicit function:

```text
Error: /private/tmp/nsc-p1b/app/src/lib/rank.ts:5:10 - error SC0001: 'item' is possibly 'undefined'. Hint: Guard the indexed value, use a tuple, or add a non-null check.
```

The original fixture for that error is:

```ts
// Original source location must survive extraction.
export async function rank(items: number[], budget: number): Promise<number> {
  "use native";
  const item = items[0];
  return item + budget;
}
```

`noUncheckedIndexedAccess` is enabled for this probe. Compilation exits 1 before
Next's TypeScript check, as required for an explicit code refusal.

F7 adds original positions, stable NSC codes, and one-line hints to extractor,
boundary, and discovery messages. The existing reason substrings remain. The
report's work, purity, and boundary categorization still uses those substrings;
the old test for `opaque: work:` now checks the function label and reason
independently because source metadata sits between them. Refusals remain refusals.

Before, from P1:

```text
Error: [next-scriptc] /private/tmp/nsc-p1/explicit/src/lib/rank.ts: function rank: unsupported reference weight
```

After, captured from the class parameter-property regression fixture:

```text
[next-scriptc] /app/f.ts:1:29 - NSC1001: function f: unsupported reference weight Hint: Use a supported local helper; replace class parameter properties with explicit fields and assignments.
```

`NSC1000` covers other extraction/boundary refusals, `NSC1001` unsupported
references, `NSC1002` async/generator shape, `NSC1003` module initialization,
`NSC1004` mutation, and `NSC1005` the work screen. Hints suggest a next edit;
subsequent proof failures can still require keeping a helper in JS.

F8 separates toolchain failures from code refusals. Missing compiler executables,
SC3004/helper permissions, missing archive tools, and addon linker executables
produce NSC2001 and retain JS. Incremental candidate filtering stops immediately
on infrastructure failures. Explicit async functions also retain their original
JS bodies when their compiler cannot start. Explicit code refusals still fail.

Before, from P1:

```text
[next-scriptc] not a candidate rank: /var/folders/4x/9xsch0y129j47fl92k4zx9cm0000gn/T/scriptc-vite-2k9Ch1/profile.json:1:1 - error SC3004: spawnSync ar ENOENT
```

After, captured from the packed Next consumer with a nonexistent compiler path:

```text
[next-scriptc] NSC2001: Toolchain unavailable (/tmp/nsc-p1b/missing-scriptc): spawnSync /tmp/nsc-p1b/missing-scriptc ENOENT. The app continues in JS. Repair: pnpm approve-builds && pnpm rebuild scriptc.
```

That build exits 0. Production start followed by POST `/api/rank` returns:

```text
[545,0]
```

Tests simulate missing compiler and `ar`, and classify helper permission/SC3004
failures. The ar simulation is an executable fixture emitting the compiler's
SC3004/ENOENT diagnostic, rather than removal of the host's tools. The packed
scenario uses a truly nonexistent compiler. On the first packed install, the
known helper permission failure also produced NSC2001 and built JS successfully;
`pnpm rebuild scriptc` repaired the consumer before successful native compilation.
This task does not fix scriptc's published helper permissions.

F5 gives explicit directives their own report category, including async functions.
Report-only collection records explicit refusals instead of aborting the report;
build discovery retains its forced-function failure behavior. Extraction status
is separate from build status. For Next async explicit functions, default `.next`
manifest build ID, source hash, function name, and binary presence distinguish
built from absent/stale artifacts. Other artifact locations remain uninspected.
Artifact presence does not establish execution or native dispatch.

Before, P1 reported this explicit async helper as:

```text
excluded             src/lib/rank.ts#rank
```

After, the packed report following the deliberate compiler refusal prints:

```text
explicit             src/lib/rank.ts#rank — extraction: extracted; build: not built (default .next artifact absent or stale)
```

F10 adds separate native function/module and route/process counts, shown above,
and a one-time development notice per project per process. Previously dev had no
notice. Captured new notice:

```text
[next-scriptc] Promotion runs in production builds. Dev serves JS. Test native locally: pnpm build && pnpm start (see next-scriptc README).
```

Both package READMEs now document defaults, opt-out, diagnostic repair, report
status limits, and production local testing. The packed automatic scenario also
exposed an absolute promotion-runtime import that Turbopack could not resolve in
pnpm's tarball installation path. It now uses a relative import, as the explicit
client already does; virtual Vite imports stay unchanged. A regression covers it.

## Reproduction and validation

Dependencies were installed in this worktree with an isolated pnpm store. Node
24.22.0 was prepended to PATH for the suites and consumer. The consumer was
created with `pnpm dlx create-next-app@16.4.3` in `/tmp/nsc-p1b/app`, with App
Router, TypeScript, src directory, no Tailwind, and no downloaded font dependency.
Both packages were packed from this worktree and installed as file tarballs;
pnpm-workspace.yaml overrides scriptc-promote to the packed core. pnpm 11 ignores
the older package.json pnpm settings, so consumer settings were moved into that
yaml file. No link points into the main checkout.

The scoring helper is P1's retained Item/WEIGHTS/clamp/rank fixture. POST awaits
rank. Three sequential final packed builds verify default compilation, an
explicit source diagnostic, and missing-toolchain JS fallback. The final HTTP
probe verifies the expected two-record scores. Native compilation and one JS
response establish neither a speedup nor convergence of dispatch policy.

Commands, with Node 24.22.0 first on PATH:

```text
pnpm --dir packages/next-scriptc test
101 tests; 101 passed; 0 failed; 0 skipped
pnpm --dir packages/scriptc-promote test
43 tests; 41 passed; 0 failed; 2 existing skips
```

`git diff --check` passes. The suites cover native compilation and adapter HTTP
parity in addition to the new diagnostic, reporting, default, and summary tests.

## What remains

F4's supported live runtime report and CI visibility remain P2 work. Explicit
artifact inspection currently covers Next async functions in the default `.next`
output only. Other adapters, custom dist directories, and automatic explicit
functions report build status as uninspected. The report does not run the
explicit compiler or establish a running native lane. Upstream helper permission
packaging remains F9. Other-adapter setup recipes remain F3 follow-ups.

Temporary consumers and task-owned servers are removed after validation. Root
README, the main checkout and its node_modules, both protected compiler trees,
and external services are untouched. No deploy, Docker, push, PR, issue, public
post, or secret is involved.
