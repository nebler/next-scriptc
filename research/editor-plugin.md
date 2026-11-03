# IDE1: TypeScript language-service plugin

2026-11-03. `scriptc-promote/ts-plugin` is a CommonJS tsserver entry point exported
from the existing ESM package. A shipped `ts-plugin` directory with a CommonJS
shim also supports TypeScript 5's legacy plugin resolver, which does not honor
package exports. It decorates semantic diagnostics, suggestion
diagnostics, and quick info. [Editor setup](../docs/editor.md) requires only a
tsconfig plugin entry and a workspace TypeScript installation.

## Design

A worker imports the existing discovery, extraction, diagnostic, and boundary
modules. `discoverPromotions` runs with `reportOnly: true`. Worker-local read
wrappers overlay unsaved buffers; a directory-list wrapper restricts discovery
to the requested file. Imported dependencies remain available to the existing
closure resolver. These wrappers never write files or affect the tsserver
process. Existing discovery rules, dispatcher policy, and B1 files are unchanged.

Synchronous explicit functions use discovery's forced-candidate behavior.
Explicit async functions and file directives use `extractFunctions` and
`checkFunctionTypes`. Extraction also diagnoses marked shapes that automatic
discovery excludes. Diagnostic messages retain the original NSC code and repair
hint; the numeric tsserver diagnostic code is its numeric suffix. Source line
and column become offsets into the original editor buffer. Hover combines the
existing TypeScript hover with eligible or blocked status. Optional unmarked
suggestions default off. There are no code fixes.

The synchronous request path reads a version key, schedules a debounce timer,
and attaches bounded cached results. It does not run Babel, discovery, compiler
checks, filesystem reads, or dependency hashing. The debounce callback gathers
bounded source snapshots and sends one job to a worker. Results refresh tsserver
diagnostics only if the source/project key still matches. Errors preserve the
original TypeScript result. Disposal cancels timers and terminates the worker.

The worker caches its last result by source snapshots and options plus observed
read-content hashes and resolution-file existence. A request after one second
schedules revalidation. Source and project version changes discard displayed
results immediately. There is no idle polling. A maximum of 32 files is retained;
the source, result, and time limits are documented in the setup guide. Jobs are
serialized within each project. No build outputs or temporary source trees are
created.

## Latency evidence

Measured locally on arm64 macOS, Node 26.13.0 and TypeScript 5.9.3, with both
package suites also running. Run from this worktree:

```sh
node packages/scriptc-promote/test/support/editor-latency.mjs
```

The harness warms one real TypeScript service, then measures 200 paired baseline
and decorated semantic-diagnostic calls. The added latency is decorated minus
baseline time; small values include clock and scheduling noise. Initial readiness
includes TypeScript's first analysis, debounce, worker startup, and discovery.
Worker cache round trips include dependency hash validation and message transfer.

| Source | Characters | Added p50 | Added p95 | Worker analysis | Initial readiness | Worker cache round trip |
|---|---:|---:|---:|---:|---:|---:|
| `examples/demo/lib/native-example.ts` | 188 | 0.011 ms | 0.054 ms | 426 ms | 1,271 ms | 13.4 ms |
| `examples/shared-native/lib/forecast.ts` | 1,777 | 0.008 ms | 0.017 ms | 1,208 ms | 1,971 ms | 17.1 ms |

Both second worker jobs reported cache hits. These are local request-path
measurements, not an editor interaction benchmark or a large-monorepo guarantee.
The worker's TypeScript work takes hundreds of milliseconds even for small files;
keeping it outside tsserver's request thread matters. The five-second timeout
bounds a worker job; it does not interrupt the underlying TypeScript service's
own work. Snapshot collection is deferred and bounded but still uses tsserver's
thread. Stock scriptc's checker is omitted to avoid extra toolchain startup and
artifact work; its latency was not measured or claimed.

## Validation and remaining limits

Tests apply the plugin to `ts.createLanguageService` and cover original diagnostic
spans, NSC code and hint, eligible functions, hover, unsaved edits, file directives,
optional automatic suggestions, nested refusals, host exceptions, worker failures,
and recovery. A direct worker test confirms cache hits and dependency-content
invalidation. The package self-reference resolves the exported CommonJS entry.

The integration has not been exercised in VS Code, WebStorm, or Neovim UI.
Compiler-only scriptc diagnostics, compiler source maps, actual native execution,
and speed decisions remain build/runtime concerns. Next-specific async lowering
and bundler resolver configuration are not emulated. Discovery reads on-disk
project config; restart after config changes if the editor has not reloaded it.
Disk-only edits require a subsequent language-service request to revalidate.
Over-limit or timed-out analysis supplies ordinary TypeScript results. There is
no code fix that silently changes semantics.

No protected checkout or compiler tree, root README, hosting service, deployment,
Docker, push, PR, issue, public post, package publication, or secret is involved.

Validation commands on Node 26.13.0:

```sh
pnpm --dir packages/next-scriptc test
# 103 passed
pnpm --dir packages/scriptc-promote test
# 87 passed, 2 existing skips
```

`git diff --check` passes. The eight new plugin tests are part of the core suite.
