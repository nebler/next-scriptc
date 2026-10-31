# A native Route Handler primitive for Next.js

Research date: 2026-10-31. This document designs a target API; it does not claim that the proposed extension points exist today.

**Recommendation:** keep the TypeScript convention `app/**/route.ts`, select an explicitly registered runtime with `export const runtime = "scriptc"`, and use `withScriptc(nextConfig, { routes })` for compiler and process-group policy. Inside Next, add a versioned **Route Runtime Provider** contract, independent of the deployment adapter. Next should own route discovery, build-graph integration, request dispatch, response policy, and process lifecycle. The package should own compilation and its language/runtime implementation.

This is a refinement of option (b): prefer the concrete runtime ID `scriptc` to the underspecified ID `native`. Native describes an executable artifact, not a unique execution environment or compatibility promise. A future `runtime = "native"` alias would need an explicitly configured provider; it must not select whichever compiler happens to be installed.

**“Without forking Next.js” requires an upstream extension point.** Installed Next 16.4.3 cannot implement this target using its public adapter hooks alone. An external package can use a supported future Next release, but cannot create an internal route dispatcher, expand runtime validation, or supply Next-owned framework semantics merely by wrapping config.

## Evidence and scope

Facts below come from read-only inspection of the checkout, installed Next 16.4.3, PR descriptions/diffs, and commit-pinned PR files. Sections explicitly marked **Proposal** or **Inference** are design judgments.

- Local checkout inspected at `04b8e7c474058e03d569c83cb3544f673ee547a2`; the working tree was initially clean. Installed compiler: scriptc 0.4.6. No build, benchmark, deployment, dependency installation, checkout, or git mutation was performed for this research.
- [vercel/next.js#100130](https://github.com/vercel/next.js/pull/100130), authored by Tim Neutkens, was **open and draft**, inspected at `e6932fa7da4d24152ce7291894bfe088271fffb5` (“G” references below).
- [nextjs/adapter-vercel#147](https://github.com/nextjs/adapter-vercel/pull/147) was **open and draft**, inspected at `453c1d08eae211ca164ddf35b86920e2db2f5a13` (“V” references below). Descriptions report hosted tests; this investigation did not rerun them or inspect the linked private host implementation.
- **Important description/code discrepancy:** #100130’s description still describes `Methods []string` and `Handle`. The inspected code/docs discover named HTTP method functions and generate dispatch. Use the pinned code as the current contract, not that sentence of the description. [G1], [G2], [G3]
- Installed source references prefixed **N:** are relative to `examples/demo/node_modules/next/`, which resolves to the pnpm installation of Next **16.4.3**. These are installed `dist/` line numbers, not line numbers in the newer Go branch.
- Prototype evidence: [adapter notes](adapter-notes.md), [round 3 decisions](round3-decisions.md), [deployment investigation](vercel-native-functions.md), [benchmark protocol](benchmarks.md), and the newest sandbox report, [sandbox-2026-10-31T01-16-13.905Z.md](benchmarks/sandbox-2026-10-31T01-16-13.905Z.md). Historical statements inside the notes refer to earlier rounds; their final sections and current package source govern current behavior.

## 1. What the Go experiment actually integrates

### Discovery, compilation, and development — facts

| Concern | Implementation in #100130 | Evidence at the inspected head |
| --- | --- | --- |
| File convention | `route.go` in `app` or `src/app`; normal route groups and dynamic segments; collisions with another handler are errors. This is not globally adding `.go` to every Next page extension. | `crates/next-core/src/app_structure.rs:377–403` [G4]; `packages/next/src/server/lib/find-page-file.ts:36–73,93–179` [G5]. |
| Feature gate | `experimental.goRoutes: true`; Turbopack required. Native Go routes are classified as dynamic, bypassing JS source analysis. | `packages/next/src/build/analysis/get-page-static-info.ts:654–668` [G6]; proposed docs `route-go.mdx:123–131` [G1]. |
| Endpoint | An `AppEntrypoint::AppRoute` ending in `route.go` produces a `GoRouteEndpoint`, with no action manifest. | `crates/next-api/src/app.rs:1082–1095` [G7]. |
| Language API | A `package main` defines `GET`, `POST`, etc. using `net/http` signatures. Next discovers names; generated code places them in an `http.HandlerFunc` table, so the Go compiler validates signatures. | `go_route.rs:307–345`; `go_route_methods.go:22–59`; `go_route_dispatch.go:9–41` [G2], [G3], [G8]. |
| Build task | `GoRouteEndpoint::output` is a Turbo Tasks function. It collects non-test sibling `.go` sources, generates wrapper/dispatch sources, and calls `turbopack_go::go_bundle_with_session`. The compiler task executes `go build`, validates input snapshots, and persists executable bytes with executable permissions. | `go_route.rs:281–405`; `turbopack-go/src/lib.rs:1102–1178,1213–1262,1289–1299` [G2], [G9]. |
| Invalidations | Sources, dependencies, embedded assets, generated code, toolchain and target participate in the graph/cache. Failed builds retain validation information; source races trigger retries. This is more than a build-complete shell command or watching just `route.go`. | `turbopack-go/src/lib.rs:59–85,109–168,1187–1262` [G9]; NAPI `endpoint.rs:176–205` [G10]. |
| Emitted local entry | A content-addressed executable, a versioned `.native.json` descriptor, an NFT trace, and an app-paths manifest entry. Descriptor fields include executable path and Go-style OS/architecture names. | `go_route.rs:406–480` [G2]. |
| Development | Requests ensure compilation before invocation. The App Route dev path writes the endpoint, subscribes to issue changes **before** reporting errors, then loads manifests. New output generations cause worker replacement. Compile errors fail requests rather than silently serving the last good binary. | `turbopack-utils.ts:403–455` [G11]; `next-server.ts:1220–1243` [G12]; `native-route.external.ts:191–235` [G13]. |
| Type tooling | Go routes are excluded from generated TS handler import validation, rather than being imported as JavaScript. The compiler checks Go signatures. | `router-utils/typegen.ts:528–536,777–785` [G14]. |

Sibling Go files use named-file compilation; normal platform suffix/build-constraint selection does not select those siblings. Imported packages use Go’s selection rules. The experiment requires prepared dependencies, disables CGO, and excludes Webpack, static export, standalone output, Go pages/middleware, and guaranteed post-response work. These are explicit experiment limits, not inherent limits of native routes. [G1] (lines 39–49,85–93,123–132)

### How `next start` serves a Go route — facts

After Next obtains an `APP_ROUTE` match, `next-server.ts:1220–1243` looks up the app-paths entry. A `.native.json` entry invokes a lazily created `NativeRouteManager` with the selected page and `match.params`; it returns before the normal JS render path. No external rewrite is needed. [G12]

The manager validates the descriptor’s platform/path, starts the executable on demand, pools loopback connections, and tracks active requests. It supplies a random process-scoped token through `__NEXT_GO_TOKEN`; readiness carries that token and an ephemeral port. It filters client-supplied `x-next-go-*` metadata, then sends authentication and base64url-encoded parameter arrays in private headers. Crashes evict workers for later-request restart; startup failures remain cached for that executable generation. Changed/removed routes retire workers; shutdown closes stdin and bounds draining. [G13] (lines 44–188,191–280,345–375)

The generated self-host wrapper binds `127.0.0.1:0`, verifies the token, decodes and removes private headers, installs decoded params into request context/`PathValue`, reports readiness, and watches stdin for owner shutdown. Catch-all arrays remain available through generated `ParamValues`, rather than being irreversibly joined. [G15] (lines 17–74)

The manager forwards the selected request’s method, URL, headers and streamed body. Client disconnect destroys the upstream request. It copies response status/raw header values and pipes the upstream response. It has a dedicated keep-alive agent, not httpxy’s external-rewrite proxy. [G13] (lines 281–342)

**Important limit:** this is internal native dispatch, but **not yet reuse of the ordinary App Route response sender**. At `native-route.external.ts:307–335`, the code writes directly to the underlying Node response. At `next-server.ts:1243`, it exits before the ordinary App Route path. Do not infer Node App Route compression, `Vary`, header precedence, caching, or instrumentation parity from sharing the router. Those need explicit integration and tests. [G12], [G13]

### What deployment adapters receive — facts

The PR widens only `AdapterOutput['APP_ROUTE'].runtime` to include `go`; shared Node/Edge output types remain unchanged. Build completion recognizes the native descriptor, validates paths, reads traces, and emits an independent route output:

- `type: APP_ROUTE`, `runtime: 'go'`;
- existing `filePath` points to the **executable**, not its descriptor or a JS launcher;
- existing `pathname`, `id`, `sourcePage`, `assets`, `assetsHashes`, and `config` retain their roles;
- entrypoint content is hashed without duplicating the binary in `assets`;
- native handling continues before Node grouping, preserving mixed Node output behavior.

See `packages/next/src/build/adapter/build-complete.ts:271–274,1188–1284`. [G16]

An adapter build compiles a **different wrapper** from a local self-hosted build. The adapter executable starts without arguments on `PORT`; it derives params from its emitted route pattern. Optional `NEXT_GO_ADAPTER_ROUTING` identifies a protected concrete-path header, consumed and removed before user code, while the forwarded request URI/query remain available. It does not require self-host token/stdin ownership. [G2] (lines 346–355); [G17] (lines 20–62,79–168)

### What can scriptc reuse? — inference

Most **serving machinery** is language-agnostic: native descriptors, content-addressed generations, tracing, route matching, trusted params, authenticated loopback transport, keep-alive, cancellation, retirement and deployment entrypoints. A scriptc wrapper implementing the same wire/lifecycle contracts could use a generalized manager with few conceptual changes.

It cannot reuse the Go **compiler integration** unchanged: source discovery, Go AST analysis, module/embed tracking, compiler flags, target names and generated Go source are language-specific. Today even the generic-looking manager uses Go-specific environment/header names, readiness markers and descriptor target fields. Adapter output production hardcodes `runtime: 'go'`; #147 explicitly rejects other runtime IDs and resolves only `route.go` source files. Simply emitting `runtime: 'scriptc'` or `'native'` therefore fails. [G2], [G13], [G16]; [V1] (lines 174–236,392–407)

Generalize the **execution contract**, not “pretend scriptc is Go.” Also distinguish internal route kinds from deployment categories: Tim’s current review comment asks for a distinct internal `AppGoRoute` rather than reusing `AppRoute`. A generic `AppRuntimeRoute` could address that concern while still emitting the deployment category `APP_ROUTE`. That is a proposal, not an accepted review resolution. [G18]

## 2. User API choices

### What installed Next does today — facts

`export const runtime = "native"` is **invalid segment configuration**, not a plugin escape hatch or a fallback to Node. In installed Next:

1. `N:dist/build/segment-config/app/app-segment-config.js:133–136` permits only `edge` and `nodejs`.
2. `:141–186` parses and throws on failure. A read-only call to that installed parser with `{ runtime: 'native' }` produced `Invalid enum value. Expected 'edge' | 'nodejs', received 'native' at "runtime"` within the invalid-segment-config error.
3. `N:dist/build/analysis/get-page-static-info.js:468–488` extracts exported constants and invokes that parser; build segment collection also parses userland at `dist/build/segment-config/app/app-segments.js:57–66`. Thus an ordinary statically declared unknown runtime fails the build/route compilation path. No whole build was run here. [N1], [N2], [N3]
4. The TS language service has its own runtime options (`dist/server/typescript/rules/config.js:89–96,497–543`). Some generated Turbopack validators deliberately allow `string`, so absence of a TypeScript error does **not** imply build support. [N4], [N5]

The Go experiment does not make `export const runtime = 'go'` valid. Its discovery convention bypasses JS segment analysis and its adapter output separately labels the executable `go`. **Source config runtime and adapter-output runtime are distinct contracts.** [G6], [G16]

The adapter-era convention is now `app/**/route.native.ts`, the TypeScript
equivalent of `route.go`. `withScriptc` enables the compound `native.ts` extension
while development and the Node baseline still run the module on Node.
`"use native"` (formerly `"use scriptc"`) is reserved for function-level compilation;
route files reject either top-level directive and require `route.native.ts`.
The proposed Next-side target remains
`export const runtime = "scriptc"` in `route.ts`.

### Comparison — design assessment

| API | Discovery and visible boundary | Types/editor and development | Failure modes and fit with Next/Go |
| --- | --- | --- | --- |
| **(a) `"use native"`** | Small, local opt-in; easy to search, invisible in the file tree. The directive needs explanation: is it file-scoped compilation, a transitive graph boundary, or callable native functions? | Ordinary TS editors work, but they cannot infer compiler restrictions from an unknown directive. Current dev executes real Next/Node; native-only checking happens at production compilation. A proper directive implementation could provide native dev, but the spelling alone cannot. | JavaScript accepts an unrecognized directive silently. A misplaced/removed directive or missing wrapper can execute Node successfully. The adapter now rejects both route-level directive spellings with a migration error and rejects the old function spelling with a rename error. Weaker permanent runtime declaration. Does not match Go’s file discovery. |
| **(b) `runtime = "native"`** | Uses the established place for execution-environment choice. Visible in code review and searchable; less visible than a filename. “Native” alone leaves compiler, API support and scheduling ambiguous. | Keep TS imports, route types and the existing file convention. Extend static validation and editor runtime completion from the registry; run native diagnostics in dev. Literal config can choose the endpoint before JS bundling. | Today it fails as above. Proper support needs a registered provider, explicit unknown-runtime errors, leaf-route-only scope, and no Node fallback. Closest existing Next abstraction for **same-language** handlers. Recommend this option’s shape with the exact ID **`scriptc`**. |
| **(c) `route.native.ts`** | Strongest file-tree boundary; communicates a separate compile/execution unit before opening the file. `native` still needs a compiler binding. `route.scriptc.ts` would name it exactly. | Normal TS syntax highlighting survives. The adapter enables discovery with the compound `native.ts` page extension and checks conflicts itself. Native validators, diagnostics and execution still need provider support; `pageExtensions` alone supplies only Node routing. Native dev is just as necessary as for (b). | Fail closed if the convention is recognized but its provider is absent. On old Next an unrecognized filename can simply disappear from routing. Closest visual precedent to `route.go`, but Go’s parser/language distinction is stronger. Good alternative if Next wants an executable-entrypoint family of file conventions. |
| **(d) `withScriptc(config, { routes })` selects routes centrally** | Excellent inventory and cross-route planning, but a handler opened in isolation gives no hint of its runtime. Selection can change when config changes elsewhere. | Keeps route exports untouched; a route-pattern map can be typed/generated. Native dev/checking still needs core support. Editor diagnostics must resolve the map to files. | Reject stale/unknown patterns, ambiguous selectors and unsupported group policies. Configuration order must never determine routing priority. Natural compiler/grouping policy API, weaker sole declaration of execution semantics. Today the second argument configures groups and optimization for filename-selected routes. |

Current adapter behavior is implemented in `src/index.ts`, `src/adapter.mjs` and `src/routes.mjs`. The second-argument map proposed in `round3-decisions.md:127–151` is implemented for group and optimization policy. [P1], [P2], [P3], [R1]

### Recommendation and the separate-file argument

**Proposal:** choose (b)’s explicit runtime declaration, **`runtime = "scriptc"`**, with (d) for settings. Use one authoritative route-local selector. The map configures already-selected routes; it does not silently convert Node routes. Keep `route.go`/`route.rs` as provider-registered conventions for other source languages.

The separate-file argument supplied in the task brief is sound: a visibly different entrypoint helps reviewers understand different APIs, compilation constraints and process/module-state boundaries. For Go, a directive inside TypeScript cannot supply Go syntax, Go tooling, or `net/http`; a `.go` file naturally does. For scriptc the source and handler signatures remain TypeScript, and Node parity is the compiler’s goal. Next already uses a runtime export to express an execution boundary within the same source language. That makes a runtime selector more economical than another TS convention.

This is a judgment, not evidence that TS boundaries are harmless. Imports share source, **not running module instances**, with Node routes; native globals, library compatibility and scheduling can differ. Native editor diagnostics, compiler errors, dev execution and a build table showing runtime/process ownership are requirements. If Next prioritizes file-tree visibility over preserving `route.ts`, `route.scriptc.ts` is the strongest alternative; use the **same provider primitive** underneath. Do not introduce both file and export selection in v1 with unclear precedence.

I did not locate the brief’s “separate file versus use go” argument in the currently returned comments for these two PRs, so I do not attribute a verbatim quotation or an acceptance decision to a specific maintainer. The distinct-route-kind comment linked above is independently verified.

## 3. RFC: pluggable Route Runtime Providers

Everything in this section is **Proposal**, informed by the facts above.

### Motivation

Today’s adapter API observes/configures a build; it cannot replace a route executor. `NextAdapter` has only `name`, `modifyConfig`, and `onBuildComplete`; the latter returns `void`. Route outputs only type Node and Edge, and config loads one `adapterPath`. [N6] (lines 30,326–395); [N7] (lines 1155–1169)

The resulting prototype workarounds cross responsibilities:

| Prototype workaround | Proper owner in the target |
| --- | --- |
| Inject loopback rewrites, then remove prerendered ones by editing `routes-manifest.json`. | Next selects each route’s final executor/static output in its build graph and writes authoritative routing/output metadata once. |
| Use external-rewrite httpxy response handling. | An internal route executor returns into Next’s common Route Handler response policy/sender. |
| Spawn children while `modifyConfig` loads config. | Next’s server lifecycle activates, supervises, retires and closes native executions. Config loading is side-effect free. |
| Redirect `next/server` with a generated tsconfig to a package-owned behavioral imitation. | Next owns its portable public API contract; the compiler implements/lower its supported dependencies. Unsupported APIs fail at compilation. |
| Occupy the single deployment adapter slot. | Runtime providers compose with the selected platform adapter, which packages completed outputs. |

These are concrete dependencies: `src/adapter.mjs:19–29,40–56,62–86`; `src/routes.mjs:72–106`; `src/native-config.mjs:8–29`; `src/runtime.mjs:13–26,82–125`. [P2], [P3], [P4], [P5]

### App-developer surface

```ts
// next.config.ts — proposed future withScriptc implementation
import { withScriptc } from "next-scriptc";

export default withScriptc({ cacheComponents: true }, {
  routes: {
    "/api/primes": { optimization: "speed" }, // only after deployment-target measurement
    "/api/hello": { group: "public-light" },
    "/api/items/[id]": { group: "public-light" },
  },
});
```

```ts
// app/api/items/[id]/route.ts
export const runtime = "scriptc";

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/items/[id]">,
) {
  return Response.json({ id: (await params).id, url: request.url });
}
```

The wrapper registers `scriptc`; it does **not** replace `adapterPath`. Its conceptual expansion is:

```ts
// Proposed Next config, not valid installed Next 16.4.3 API
experimental: {
  routeRuntimes: {
    scriptc: {
      module: "next-scriptc/next-runtime",
      options: { routes: { /* normalized pattern -> compiler/group policy */ } },
    },
  },
}
```

Use literal leaf-route runtime exports. Reject native runtime selection on React pages/layouts and inheritance that accidentally moves React execution into the provider. Validate IDs against the configured registry; reserve built-in IDs. Keep provider modules/options serializable and resolve them relative to the project through a supported loader. Compiler presence is a build/dev requirement, not a `next start` requirement.

Route-map keys are canonical Next URL patterns, excluding route groups and deployment `basePath`; keep original `sourcePage` separately. Reject keys for nonexistent or non-scriptc routes. Default optimization is `release`; omitted group means one route per executable/process. Resolve defaults before checking group conflicts. A group must share runtime, compilation target, ABI and optimization mode, and is an explicit shared scheduling/state/failure domain. The build artifact records route-to-execution membership; one group starts once. No automatic “light route” classification. These rules extend the measured round-3 recommendation. [R1]

### Runtime-author surface

The contract should be small enough to support an external compiler, but substantially stronger than “run this command after build.” Illustrative types:

```ts
// Proposed API sketch; supporting types are conceptual, not existing Next exports.
interface RouteRuntimeProvider {
  apiVersion: 1;
  id: string;                              // e.g. "scriptc", "go", "rust"
  conventions?: readonly string[];          // e.g. ["route.go"]
  capabilities: {
    protocol: "next-route-http-v1";
    prerender: "none" | "static";
    frameworkApis: readonly string[];       // versioned capability identifiers
    grouping: boolean;
  };

  analyze(ctx: TrackedRouteContext): Promise<RouteAnalysis>;
  // ctx supplies Next-discovered identity, source snapshot, normalized config,
  // tracked filesystem/negative lookups, diagnostics, and cancellation.

  compile(ctx: CompileContext): Promise<BuildResult>;
  // ctx supplies a route/group plan, host/deploy target, dependency fingerprints,
  // output location, compiler options, Next SDK contract version, and AbortSignal.
}

type BuildResult =
  | { ok: false; diagnostics: Diagnostic[]; dependencies: TrackedInputs }
  | {
      ok: true;
      diagnostics: Diagnostic[];
      dependencies: TrackedInputs;
      executions: NativeExecution[];
      routes: { sourcePage: string; executionId: string }[];
    };

interface NativeExecution {
  id: string;
  executable: string;
  assets: Record<string, string>;
  target: { os: string; arch: string; libc?: string; minLibc?: string };
  protocol: "next-route-http-v1";
  contentHash: string;
}
```

`analyze` is the compiler side of discover/analyze; **Next still owns URL discovery and precedence**. Provider conventions are limited route entrypoints, not arbitrary filesystem routers. For TS, Next parses the runtime selector before bundling the selected userland. For Go/Rust, a registered file convention identifies the parser/provider. Detect collisions across all providers and Node before choosing a winner.

`serve` should primarily be **a Next-owned implementation of the declared protocol**, rather than a provider callback allowed to write `ServerResponse`. The provider generates the language wrapper; its artifact describes how to invoke it. Next owns activation, transport, response adaptation, dev swapping and shutdown. This removes the need for a third lifecycle hook in every compiler package and makes conformance testable. A nonstandard transport, if later needed, should be a separately versioned driver contract.

Deployment adapters also need a **pre-compilation capability/target negotiation hook**, conceptually `getRouteRuntimeCapabilities()`: supported invocation protocols, target OS/architecture/libc, grouping and lifecycle features. Self-hosting supplies the host target. Fail before expensive compilation when the adapter cannot deploy the selected runtime. The hook belongs to the platform adapter; compiler registration belongs to Next config. This replaces Go-specific target environment variables with a typed contract. This hook does not exist in installed `NextAdapter`.

### Build graph and dev behavior

1. **Discover:** Next builds the route inventory and validates runtime IDs/config/conventions. Providers receive source identity, normalized pattern, methods and effective segment policy. No port numbers or rewrite rules enter the routing manifest.
2. **Analyze:** record dependencies, imports, package/lockfile/compiler/runtime-pack identity, generated wrapper and SDK versions, directory inventories and missing-file lookups. Report diagnostics at original source locations. Track failed attempts too, so adding a missing dependency or repairing a first compile recovers.
3. **Plan:** Next determines static versus runtime ownership, then explicit grouping. Reject incompatible policies; do not mix targets or silently broaden a group. Surface execution ownership in build output.
4. **Compile:** invoke the package through a build-host worker/bridge connected to the bundler graph. Include source content, target, compiler/options and SDK identity in cache keys; validate snapshots before publishing. Persist bytes and executable modes atomically, not machine-local temporary paths or cancellation objects.
5. **Dev serve:** ensure the latest compilation on demand, subscribe before surfacing errors, execute the actual native runtime, and retire old generations while admitted requests drain. Never silently run Node after a native error. Editor integration should consume the same provider diagnostics; ordinary TS checking remains useful but insufficient.
6. **Production serve:** read immutable validated execution descriptors, verify host compatibility, lazily start/reuse workers, and provide explicit startup/drain/request budgets and bounded crash-retry policy. Compiler packages and build tooling need not load in the production process. Support owner death and OS-level termination even when user code blocks.
7. **Describe deployment outputs:** Next converts the final graph to adapter outputs, including native entries, asset hashes and source identity. The adapter packages/routes outputs; it does not compile routes or repair Next manifests afterward.

The Go experiment already supplies concrete implementations for nearly every phase, but in hardcoded Go branches: discovery [G4], [G5], [G6], [G7], compiler tasks/failed input tracking [G2], [G9], [G10], dev subscription [G11], execution manager [G13], and adapter outputs [G16]. Generalizing them is actual core work. A JS provider callback cannot participate in Turbo Tasks dependency/cancellation/persistence merely because it returns a Promise. A supported build-host bridge, tracked I/O/action protocol and atomic output ingestion are required. Initial support can be Turbopack-only, with an explicit unsupported-mode error like Go’s; a Webpack loader is not an equivalent integration.

### Internal request/response dispatch

The normal installed production path explains where the boundary belongs:

- `N:dist/server/next-server.js:270–294,329–340` obtains the selected match and enters rendering for App Routes; `base-server.js:1793–1824` chooses its entry and loads components.
- `load-components.js:85–88,143–165` loads the module through `requirePage`; `require.js:48–87,98–106` resolves manifests and requires its JS entry. The App Route template constructs `AppRouteRouteModule`, adapts requests, invokes `handle`/`prerender`, then sends the response. [N8], [N9], [N10], [N11]
- The template’s `dist/build/templates/app-route.js:217–229,276–278` is the relevant execution/sending separation. `base-server.js:1765–1769` delegates to that generated handler. [N11], [N12]

**Target:** introduce a route executor abstraction at that separation. A JS executor invokes userland; a native executor invokes a supervised execution. Neither imports a binary as JavaScript. Both return a Next-internal response envelope: status/status text, ordered header pairs including repeated cookies, a pull-controlled body stream, cancellation, and a separately represented completion capability. The common route shell applies request policy, response validation, observability and supported caching, then uses the same response sender.

Next sends **trusted selected-route context** separately from the public request URL: source identity, decoded params (preserving catch-all arrays), effective routed path, external/original URL and proxy-mutated headers. Filter client-spoofable internal headers at ingress; authenticate local workers. The native language wrapper dispatches an already-selected route/method, not another URL router. Grouped artifacts receive an execution-local route key.

Map Go’s token, readiness, params and parent-ownership channels to neutral, versioned names. Its manager’s `invoke(req, res, params)` should become an invocation returning the internal response envelope, with worker activity held until stream/completion settlement. Preserve cancellation during startup, bidirectional backpressure, failed/partial response handling and shutdown. A native HTTP response cannot be turned into an unbounded buffered `Response` just to satisfy the interface.

#### Compression, `Vary`, and headers must be fixed in Next

The prototype’s divergence is specific and reproducible in the pinned implementation:

- `N:dist/server/lib/router-server.js:142–144,318–320` installs compression before dispatch; `:468–470` sends external destinations through httpxy.
- App Route `send-response.js:28–52` appends headers, and `base-http/node.js:120–126` stores appended values in arrays. The proxy instead supplies string `Content-Type` values. The bundled compression filter treats these differently and adds `Accept-Encoding` to `Vary` before several later rejection checks. [N13], [N14], [N15]; [adapter-notes.md](adapter-notes.md) (lines 338–390)
- `base-server.js:1409–1427,1489` supplies framework `Vary` and removes unneeded `next-url`; the response sender subsequently appends the handler’s `Vary`. [N16], [N14]

Merely switching httpxy to Go’s direct pipe does not guarantee equality: that pipe still bypasses the common sender and writes response headers itself. The fix is shared route policy/sending, with conformance tests for compression on/off, string/array header representations, small/large bodies, HEAD, explicit encodings, handler `Vary`, repeated cookies and proxy-set headers. Preserve whatever observable behavior Next deliberately specifies; do not institutionalize the accidental array-MIME compression bug as the native ABI. If Next corrects compression policy, correct it for both executors together. Adding `no-transform` or disabling global compression is not an equivalent fix.

### What “remove the next/server shim” actually requires

A process/HTTP primitive cannot manufacture `NextRequest`, `NextResponse`, `NextURL`, cookies, `next/headers`, cache invalidation or AsyncLocalStorage semantics. Node API parity is also not automatically **Next framework parity**. The inspected shim uses composition because scriptc 0.4.6 cannot subclass Web Request/Response, marks unsupported parsers `never`, and approximates NextURL. [P6] (lines 109–179,181–222); [adapter-notes.md](adapter-notes.md) (lines 104–153)

The target has two honest steps:

1. A minimal native runtime can support ordinary Web `Request`/`Response` route handlers, as in the example above. Reject unsupported Next value imports explicitly. This already avoids needing a `next/server` replacement for those routes.
2. To support existing Next API imports, Next should provide a small **Next-owned portable Route Handler SDK/entrypoint**, with versioned semantics and capabilities, that compilers compile or lower. A documented native export condition is one possible mechanism; a generated tsconfig path override into a third-party imitation is not the contract. Next owns cookie/URL/response behavior and shared conformance fixtures; the compiler owns implementing required Web/Node features. Editor/native-build resolution must agree, including transitive imports and aliases. Unsupported framework operations produce source diagnostics in dev/build, never plausible no-op stubs.

The SDK may require compiler improvements before the real `next/server` implementation compiles. Moving the existing shim into a newly named hook would not eliminate this work. Framework policy stays in the host where possible; ambient request/caching APIs inside a separate process need explicit native implementations or a future RPC contract. v1 should not promise automatic `next/headers`, ISR, `after()` or `waitUntil` support.

### Prerendering and caching

The current prototype lets Next evaluate TS as Node, then conservatively excludes an entire route pattern from native compilation when completed static route outputs exist. That includes dynamic routes with prerendered paths; it avoids duplicating fallback/revalidation semantics. [P2] (lines 40–57); [adapter-notes.md](adapter-notes.md) (lines 255–274)

The primitive must represent this decision **before final output emission**, without provisional rewrites or two conflicting views of routing. Providers declare prerender capability; Next owns cache identity, static outputs and fallback/ISR metadata.

For an implementable first native provider, choose **dynamic execution only**, as Go does. Make this visible in build output and reject unsupported caching configuration; do not accidentally prerender under Node and claim native equivalence. Already-Node routes keep existing optimizations. Migrating a currently prerendered `route.native.ts` fixture should leave it Node/static by renaming it to `route.ts`, unless the app intentionally chooses dynamic native execution.

A later static capability needs a conformance-backed evaluator (native host companion when deploying a cross-target binary, or a demonstrably equivalent JS evaluator) and Next’s ordinary static/fallback outputs. It must not infer target-native request behavior from arbitrary Node execution. Runtime ISR/tagged fetch caches and post-response completion are separate capabilities, not consequences of possessing an HTTP server. Group planning excludes any route whose final execution is fully static.

### Adapter outputs: retain the useful shape, specify the ABI

Keep `APP_ROUTE` as the deployment category and existing `filePath`/asset/source/config fields. Keep `runtime: 'scriptc'`/`'go'` as the provider identity, and add a **versioned native invocation descriptor**, conceptually:

```ts
{
  type: APP_ROUTE,
  runtime: "scriptc",
  filePath: "/absolute/build/path/route-executable",
  // Existing pathname, sourcePage, config, assets, assetsHashes...
  native: {
    version: 1,
    protocol: "next-route-http-v1",
    target: { os: "linux", arch: "x64", libc: "musl" },
    executionId: "api-items", // also identifies explicit group membership
  },
}
```

This deliberately adds metadata beyond Go’s zero-new-keys prototype. A standardized HTTP ABI with one host target could initially be implicit in a runtime ID; independently authored compilers/targets/groups should not require adapters to guess invocation protocol, architecture, libc or grouping from a language name or ELF inspection alone. Put the descriptor on a native discriminated branch, not as meaningless optional fields on every Node output. Only native-capable adapters opt in; unknown protocols fail explicitly. Entry hashes cover the artifact; deployment outputs must be relocatable with declared assets and modes.

One emitted route per independent function remains the deployment default. Explicit grouping requires adapter support and consistent route-to-execution mappings; reject it rather than silently unpacking a stateful group into separate functions. Keep `maxDuration`/regions separate from compiler optimization and process topology.

### Core versus external-package work

**Next must change:** registry/config/runtime validation and editor tooling; cross-provider discovery/conflict checking; typed native endpoints and build-host graph integration; native entry descriptors/loaders; server lifecycle; shared request/response policy; prerender ownership/capabilities; adapter target negotiation and native output types; the portable framework API contract.

**External packages can retain:** scriptc dependency/versioning, supported targets, compiler invocation, dependency analysis integration, generated TS entrypoints, lowering/runtime implementation, optimization/group planning, diagnostics/source mapping, native worker strategies and compiler-specific tests. Platform adapters retain function packaging, provider IPC bridges, deployment routing and platform feature support. `withScriptc` becomes registration convenience, rather than taking over deployment ownership.

## 4. Deployment on Vercel

### What #147 implements — facts

`go-outputs.ts:28–44,219–277` loads an absolute `NEXT_ADAPTER_VERCEL_GO_PACKAGER_PATH`, verifies packager version 1, and requires two mode-0755 files: `executable` and `user-server`. Returned config must specify `runtime: 'executable'`, handler `executable`, language `go`, architecture `x86_64`, and streaming. An independently installed adapter without that host bridge throws. It cannot currently accept a scriptc output or merely omit its Go language field. [V1]

Packaging resolves the original `route.go` from `sourcePage`, applies function overrides, stages declared assets and native files, and writes `.vc-config.json`. Node launcher/grouping fields are omitted. Routing provides protected `x-matched-path` context and excludes Go function paths from conflicting generic Node header rules. This is important for rewrites and encoded catch-all boundaries, not cosmetic header metadata. [V1] (lines 392–468); [V2] (lines 13–17,56–60,80–133,172–198)

### Recommended native executable path — proposal supported by public precedent

Use a platform bridge around the scriptc HTTP server:

```text
functions/api/items.func/
  .vc-config.json
  executable       # reusable platform IPC bridge, executable mode
  user-server      # target-Linux scriptc HTTP binary, executable mode
  ...declared assets
```

The platform entrypoint implements Vercel’s IPC lifecycle and starts `user-server` with `PORT`. Public Vercel code already packages this layout and uses the `executable` runtime. The bridge connects to `VERCEL_IPC_PATH`, provides health handling, removes internal invocation headers, forwards HTTP, and reports invocation completion. The public guide specifies NUL-delimited lifecycle messages; a plain HTTP listener does not implement those messages. [D1] (lines 49–82); [D2] (lines 173–218,272–335); [D3] (lines 19–81,118–122)

The current scriptc shim already binds loopback `PORT` and serves HTTP, so it supplies the **user-server side**, not a complete Vercel runtime. It also needs the standardized routed/original URL distinction: today it rematches `incoming.url`, which is insufficient if the platform preserves an original public URI across rewrites. Replace that adaptation with trusted routing context, preserving encoded segments, method, binary bodies, repeated cookies and cancellation. [P7] (lines 159–163,197–234,270–283); [G17]; [V2]

Compile for the deployment target, not the developer Mac. Initially prefer validated Linux x64 static musl output, or deliberately compatible GNU/glibc output; validate ELF architecture/loader/dependencies, assets, certificates, modes and relocation. The existing investigation records scriptc GNU 2.34 baselines and musl targets. Those are compatibility inputs, not proof that this exact function deploys. [vercel-native-functions.md:158–173](vercel-native-functions.md)

Do **not** label TypeScript as Go to satisfy a packager. Public build-utils accepts only `go`/`rust` when `runtimeLanguage` is supplied; Swift Labs emits `executable` output without that optional field. This supports omission as an artifact precedent, while the shared standalone helper itself currently requires a Go/Rust language value. A generic, supported bridge/packager or explicit scriptc support is needed; #147 cannot be reused unmodified. [D1] (lines 10,38–45); [D4] (lines 257–261); [D5] (lines 175–184)

The public sources establish a feasible architecture. They do **not** establish ordinary-account acceptance, a supported generic packager distribution, or long-term ABI stability. A real mixed Next/scriptc deployment must verify those points. The Go PR’s linked private host change is not a public extension contract.

### Why `provided.al2023` is a different option — facts and inference

Vercel build-utils currently resolves its provided runtime to `provided.al2023`. AWS custom runtimes require an executable `bootstrap` that reads `AWS_LAMBDA_RUNTIME_API`, obtains invocation events, and posts responses/errors. Listening on `PORT` alone cannot satisfy it. [D6]; [D7]

For Vercel, the event conversion is also specific: the public Go bridge reads an outer event’s `Body` as nested request JSON, handles header arrays/base64 bodies, and returns status, header arrays and base64 response data. It calls the Lambda runtime loop. A generic API Gateway-shaped response assumption is insufficient. [D8] (lines 15–45,70–104,121–158)

**Inference:** a separate scriptc-compatible Lambda bridge could implement that contract and serve as a fallback deployment experiment. It is more adaptation work for the existing HTTP prototype, and streaming/wrappers/completion require additional protocols. Prefer executable/IPC for the target; do not describe `provided.al2023` and `executable` as interchangeable labels for the same binary.

For a full application, the selected Vercel adapter must preserve existing Node/Edge/static outputs, middleware/proxy and routing phases, then package native outputs. Today `withScriptc` replaces the single adapter slot; simply emitting a `.func` directory does not preserve the rest of a Vercel Next deployment. The independent runtime registry fixes that architectural conflict. [N6], [N7]; [P1]; [vercel-native-functions.md](vercel-native-functions.md) (lines 89–121)

## 5. What the prototype and benchmarks establish

**Established in retained project evidence, not rerun here:** TS handlers can be compiled to standalone native HTTP binaries and served alongside ordinary Next routes using plain `next start`. Current code has explicit child ownership, readiness, restart/cutoff, shutdown, and build-ID validation. Retained verification reports 16 native routes, 85 route cases and 87 shim comparisons, including response bytes/headers, body state, streaming and lifecycle checks. Its documented compression allowance and unsupported APIs still apply. [P2], [P5]; [adapter-notes.md](adapter-notes.md) (lines 750–774)

The newest complete Linux sandbox report is tied to commit `06585640606aa779e8f02ed393a9486628789517`, **before later local shim optimizations**. It compares Node 24.22.1 and scriptc 0.4.6 with identical handler fixtures, a production Next baseline, and CPU affinity. Selected **end-to-end C=1 p50** results show why selection must be explicit:

| Workload | Node ms | Native ms | Native/Node latency |
| --- | ---: | ---: | ---: |
| JWT verification | 0.625 | 0.391 | 0.625× |
| Revenue aggregation | 3.455 | 1.333 | 0.386× |
| Gzip export | 4.537 | 3.099 | 0.683× |
| Async scrypt login | 83.535 | 79.630 | 0.953× |
| Product search | 1.146 | 5.663 | 4.939× |
| Markdown | 0.998 | 24.571 | 24.623× |
| Bcrypt login | 79.570 | 9688.813 | 121.764× |
| Upload integrity | 2.500 | 4.141 | 1.656× |
| Image histogram | 2.754 | 5.890 | 2.139× |
| RSS feed | 1.226 | 26.847 | 21.905× |
| Nearby stores | 2.118 | 1.764 | 0.833× |

Source: newest sandbox report **lines 51–74**. This preserves all eleven application outcomes, including losses; hello/primes/report are separate controls/synthetic work. The report’s limitations **lines 13–26** matter: few repetitions, only three measured login requests, possible client saturation, no DB/remote I/O/TLS/serverless scheduling, and dynamic-tier statements within “static” coverage. These are workload observations, not a universal compiler-speed claim or Vercel billing measurement.

Direct process startup to the first successful hello response was **133.382 ms Node / 4.247 ms native**; whole Next application startup to that response was **401.624 / 462.982 ms**. Initialized idle whole-app summed RSS was **128.059 / 229.465 MiB**, despite much smaller individual native processes. A remaining Next frontend and sixteen resident native route processes matter. These are process-cold measurements and summed RSS, not serverless cold starts or unique physical memory. [sandbox report:95–150,152–227](benchmarks/sandbox-2026-10-31T01-16-13.905Z.md)

The later local round-3 experiments support **release default, explicit grouping**, not a new Linux headline. Speed gains were small/mixed; grouping all sixteen routes reduced initialized summed RSS by 25.1% but moved hello-under-Markdown p99 from **0.242 to 22.207 ms**. A bounded Markdown worker recovered that specific tail, without proving a general worker pool or process isolation. These were loaded macOS experiments excluding the Next frontend. [round3-decisions.md:19–25,77–125](round3-decisions.md)

**Design consequence:** expose a native execution choice and observable process/group policy. Do not automatically compile every route, choose optimization modes from library names, equate async callback signatures with nonblocking work, or promise whole-app memory/cold-start gains. Removing the rewrite path should improve correctness and remove avoidable adaptation work; its future performance effect must be measured, not extrapolated from these data.

## 6. Scope, open questions, and migration

### A bounded first RFC

Propose an experimental, Turbopack-first **native HTTP Route Runtime Provider v1**, initially dynamic App Router Route Handlers, one executable per route, Web request/response APIs, internal trusted routing context, common Next response policy, supervised local execution and capability-negotiated deployment outputs. Demonstrate both Go and scriptc against it before stabilizing the public contract. This is narrower than a general Next plugin system or arbitrary native React execution.

Allow the options shape to evolve toward the measured `group` policy; enable grouping only when the provider **and adapter** implement it. Compiler-specific optimization can be supported immediately. Unsupported requested options must error, rather than silently being ignored. This stages the primitive without claiming the existing partial worker prototype is production-ready.

### Maintainer decisions still needed

1. **Source selection:** registered runtime export versus a family of runtime-specific filenames. Does Next want an extension registry for runtime IDs, and should declarations be strictly leaf-local? The implementation primitive should support Go’s distinct source language whichever TS spelling wins.
2. **Build-host contract:** how should external compilers report tracked positive/negative inputs, native toolchain fingerprints, concurrent-source retries and failed-build dependencies into Turbo Tasks without arbitrary untracked callbacks? What is the supported diagnostic/cache ABI?
3. **Framework compatibility:** which `next/server` APIs can become a portable Next-owned SDK, and what compiler work is required? What is the honest v1 support profile for NextURL, body parsers, request abort, contextual APIs and debugging/symbolication?
4. **Response policy:** should native adoption coincide with correcting existing compression/header inconsistencies? Define behavior once and test Node, self-host native and deployed native. Do not call direct HTTP piping full App Route parity.
5. **Static/caching semantics:** dynamic-only initial scope versus a host/native prerender evaluator; later ISR, tagged fetches, invalidation and fallback ownership. No silent Node/native evaluator substitution.
6. **Completion and supervision:** request deadline versus worker startup/drain timeout, crash-loop backoff, in-flight retirement, logs/traces, forced owner-death cleanup, bounded queues, slow clients and post-response completion. HTTP response completion and application work completion are not always identical.
7. **Provider deployment contract:** public supported executable/IPC packager, language metadata acceptance, target/libc negotiation, actual Vercel-account support, concurrency and lifecycle accounting. #147’s Go-only/private-host dependency is still a gap for scriptc.
8. **Grouping:** shared module state, route identity, memory/tail tradeoffs, deployment capability and restart semantics. Can a platform preserve an explicit group as one execution unit? If not, reject the policy.

### Migration from next-scriptc

1. Keep the current adapter implementation explicitly version-pinned as a compatibility path. Do not disguise a prototype rewrite shim as the new primitive.
2. Land the core contract in an experimental upstream release with Go as the first conformance implementation; add the scriptc package as a second independently versioned provider. Until that exists, a clean no-fork target remains unavailable on shipped 16.4.3.
3. Replace `withScriptc`’s `adapterPath` assignment with runtime registration, preserving whichever deployment adapter Next/platform selected. Carry the proposed second-argument map into provider options with validation.
4. Offer a codemod from `route.native.ts` to `route.ts` with leaf `export const runtime = "scriptc"`; reject conflicting runtime declarations and sibling route files. Keep known prerendered fixtures Node/static unless the user explicitly changes their execution semantics. Handle legacy and new builds distinctly by artifact/API version.
5. Move discovery/compilation into Next’s provider/build graph, emit native execution descriptors/outputs, and remove generated external rewrites, hardcoded ports and `routes-manifest.json` surgery.
6. Adopt Next-owned invocation/lifecycle/response policy; delete `modifyConfig` process startup and package-specific supervision once equivalent crash, readiness and shutdown coverage exists. Keep standard `next dev`, `next build`, and `next start`; retain the old CLI alias only for compatibility.
7. Replace build-only `next/server` aliasing with the supported Web-only profile and then the Next-owned SDK as compiler compatibility permits. Port the existing parity fixtures to shared conformance tests; retain known refusals instead of broadening types beyond working behavior.
8. Generalize Vercel native packaging and run a real mixed deployment: static/Node/native routes, rewrites/proxy, encoded params, repeated headers/cookies, binary uploads, streaming, cancellation, cold starts, concurrent requests and failure recovery. Only then claim hosted support.

Success means the native route is a first-class Next-selected executable with the same applicable route policy, and the compiler remains replaceable in an external package. It does not mean every compiler must implement every Next API or that compiling a route necessarily makes it faster.

<!-- Citation targets: pinned remote snapshots and installed Next 16.4.3. -->

[G1]: https://github.com/vercel/next.js/blob/e6932fa7da4d24152ce7291894bfe088271fffb5/docs/01-app/03-api-reference/03-file-conventions/route-go.mdx
[G2]: https://github.com/vercel/next.js/blob/e6932fa7da4d24152ce7291894bfe088271fffb5/crates/next-api/src/go_route.rs
[G3]: https://github.com/vercel/next.js/blob/e6932fa7da4d24152ce7291894bfe088271fffb5/crates/next-api/src/go_route_dispatch.go
[G4]: https://github.com/vercel/next.js/blob/e6932fa7da4d24152ce7291894bfe088271fffb5/crates/next-core/src/app_structure.rs#L377-L403
[G5]: https://github.com/vercel/next.js/blob/e6932fa7da4d24152ce7291894bfe088271fffb5/packages/next/src/server/lib/find-page-file.ts
[G6]: https://github.com/vercel/next.js/blob/e6932fa7da4d24152ce7291894bfe088271fffb5/packages/next/src/build/analysis/get-page-static-info.ts#L654-L668
[G7]: https://github.com/vercel/next.js/blob/e6932fa7da4d24152ce7291894bfe088271fffb5/crates/next-api/src/app.rs#L1082-L1095
[G8]: https://github.com/vercel/next.js/blob/e6932fa7da4d24152ce7291894bfe088271fffb5/crates/next-api/src/go_route_methods.go#L22-L59
[G9]: https://github.com/vercel/next.js/blob/e6932fa7da4d24152ce7291894bfe088271fffb5/turbopack/crates/turbopack-go/src/lib.rs
[G10]: https://github.com/vercel/next.js/blob/e6932fa7da4d24152ce7291894bfe088271fffb5/crates/next-napi-bindings/src/next_api/endpoint.rs#L176-L205
[G11]: https://github.com/vercel/next.js/blob/e6932fa7da4d24152ce7291894bfe088271fffb5/packages/next/src/server/dev/turbopack-utils.ts#L403-L455
[G12]: https://github.com/vercel/next.js/blob/e6932fa7da4d24152ce7291894bfe088271fffb5/packages/next/src/server/next-server.ts#L1220-L1243
[G13]: https://github.com/vercel/next.js/blob/e6932fa7da4d24152ce7291894bfe088271fffb5/packages/next/src/server/lib/native-route.external.ts
[G14]: https://github.com/vercel/next.js/blob/e6932fa7da4d24152ce7291894bfe088271fffb5/packages/next/src/server/lib/router-utils/typegen.ts#L528-L536
[G15]: https://github.com/vercel/next.js/blob/e6932fa7da4d24152ce7291894bfe088271fffb5/crates/next-api/src/go_route_main.go#L17-L74
[G16]: https://github.com/vercel/next.js/blob/e6932fa7da4d24152ce7291894bfe088271fffb5/packages/next/src/build/adapter/build-complete.ts#L1188-L1284
[G17]: https://github.com/vercel/next.js/blob/e6932fa7da4d24152ce7291894bfe088271fffb5/crates/next-api/src/go_route_adapter_main.go
[G18]: https://github.com/vercel/next.js/pull/100130#discussion_r4424258848
[V1]: https://github.com/nextjs/adapter-vercel/blob/453c1d08eae211ca164ddf35b86920e2db2f5a13/packages/adapter/src/go-outputs.ts
[V2]: https://github.com/nextjs/adapter-vercel/blob/453c1d08eae211ca164ddf35b86920e2db2f5a13/packages/adapter/src/go-routing.ts
[N1]: /Users/noah/code/next-scriptc/examples/demo/node_modules/next/dist/build/segment-config/app/app-segment-config.js:133
[N2]: /Users/noah/code/next-scriptc/examples/demo/node_modules/next/dist/build/analysis/get-page-static-info.js:468
[N3]: /Users/noah/code/next-scriptc/examples/demo/node_modules/next/dist/build/segment-config/app/app-segments.js:57
[N4]: /Users/noah/code/next-scriptc/examples/demo/node_modules/next/dist/server/typescript/rules/config.js:89
[N5]: /Users/noah/code/next-scriptc/examples/demo/node_modules/next/dist/server/lib/router-utils/typegen.js:554
[N6]: /Users/noah/code/next-scriptc/examples/demo/node_modules/next/dist/build/adapter/build-complete.d.ts:326
[N7]: /Users/noah/code/next-scriptc/examples/demo/node_modules/next/dist/server/config.js:1155
[N8]: /Users/noah/code/next-scriptc/examples/demo/node_modules/next/dist/server/next-server.js:270
[N9]: /Users/noah/code/next-scriptc/examples/demo/node_modules/next/dist/server/base-server.js:1793
[N10]: /Users/noah/code/next-scriptc/examples/demo/node_modules/next/dist/server/load-components.js:85
[N11]: /Users/noah/code/next-scriptc/examples/demo/node_modules/next/dist/build/templates/app-route.js:217
[N12]: /Users/noah/code/next-scriptc/examples/demo/node_modules/next/dist/server/base-server.js:1765
[N13]: /Users/noah/code/next-scriptc/examples/demo/node_modules/next/dist/server/lib/router-server.js:318
[N14]: /Users/noah/code/next-scriptc/examples/demo/node_modules/next/dist/server/send-response.js:28
[N15]: /Users/noah/code/next-scriptc/examples/demo/node_modules/next/dist/server/base-http/node.js:120
[N16]: /Users/noah/code/next-scriptc/examples/demo/node_modules/next/dist/server/base-server.js:1409
[P1]: /Users/noah/code/next-scriptc/packages/next-scriptc/src/index.ts:4
[P2]: /Users/noah/code/next-scriptc/packages/next-scriptc/src/adapter.mjs:17
[P3]: /Users/noah/code/next-scriptc/packages/next-scriptc/src/routes.mjs:20
[P4]: /Users/noah/code/next-scriptc/packages/next-scriptc/src/native-config.mjs:8
[P5]: /Users/noah/code/next-scriptc/packages/next-scriptc/src/runtime.mjs:82
[P6]: /Users/noah/code/next-scriptc/packages/next-scriptc/shim/next-server.ts:109
[P7]: /Users/noah/code/next-scriptc/packages/next-scriptc/shim/serve.ts:159
[R1]: /Users/noah/code/next-scriptc/research/round3-decisions.md:127
[D1]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/internals/ipc-proxy/src/index.ts#L38-L82
[D2]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/internals/ipc-proxy/bootstrap/proxy.go#L173-L335
[D3]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/.claude/skills/vercel-runtime-implementation-guide.md#L19-L81
[D4]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/packages/build-utils/src/lambda.ts#L257-L261
[D5]: https://github.com/vercel-labs/swift-vercel-runtime/blob/a7d44bf1068337fe24e86c2124340cc45ef57513/Plugins/VercelPlugin/Plugin.swift#L175-L184
[D6]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/packages/build-utils/src/provided-runtime.ts#L1-L14
[D7]: https://docs.aws.amazon.com/lambda/latest/dg/runtimes-custom.html
[D8]: https://github.com/vercel/go-bridge/blob/cfc76d26d5540497473afcaf0575fc28fb87e970/go/bridge/bridge.go#L15-L158
