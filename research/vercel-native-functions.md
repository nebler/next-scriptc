> Historical investigation. For current usage see the [root README](../README.md); for the final Vercel measurements see [vercel-final.md](vercel-final.md). Earlier protocols and failures below are retained as evidence.

# Native scriptc binaries as Vercel Functions

Research date: 2026-10-30. Read-only investigation; no deployment, login, project creation, package installation, or downloaded-code execution was performed.

## Short answer

**Feasible — medium-high confidence, subject to an actual deployment test.** Third-party native execution is an intended Vercel custom-runtime capability, not demonstrably a privilege reserved for Vercel's Go builder. The public Runtime API reference documents `provided.al2023`; the Build Output API accepts a string-valued `runtime`; Vercel's published Go builder uses that custom runtime; and the public function deserializer reconstructs an ordinary `Lambda` from non-Node `.vc-config.json` output. There is also a remarkably close public precedent: Vercel Labs' Swift runtime creates native `executable` functions and documents deploying `.vercel/output` with `vercel deploy --prebuilt`. [Runtime reference][runtime-reference], [Build Output API][boa], [Go packaging][go-package], [function reader][function-reader], [Swift packaging][swift-package].

**Support qualification:** the documented custom-runtime route and a first-party-supported scriptc integration are different claims. I found public support for building custom runtimes, but no official promise that Vercel supports scriptc, composes arbitrary Next.js adapters, or guarantees the `executable`/Fluid IPC interface as a stable third-party API. A bare `node:http` server binary is insufficient as the function entrypoint: it needs either a Lambda Runtime API implementation under `provided.al2023`, or Vercel's HTTP-plus-IPC bridge under `executable`. The latter is publicly implemented and documented in repository guidance, but is less formally specified than the former. If “supported” means a documented, stable native HTTP-server ABI specifically for scriptc, that stronger requirement is **not established** by this research.

The Next.js Go prototype does use a Vercel-host-supplied packager, including an integration referenced in a non-public repository. That restricts reuse of **that prototype integration**; it is not evidence that independently constructed custom-runtime Build Output API functions require private access. [Next.js experiment][next-go-pr], [adapter experiment][adapter-go-pr].

Confidence is high in the observed packaging and protocol contracts, medium-high in deploying a conforming custom-runtime binary through prebuilt output, and medium in seamless integration with Vercel's current Next.js adapter. No claim below substitutes for testing the hosted deployment validator and invocation path.

## 1. What the public Build Output API actually documents

The [function primitives documentation][boa], under “Base config,” gives:

```ts
type ServerlessFunctionConfig = {
  handler: string;
  runtime: string;
  memory?: number;
  maxDuration?: number | 'max';
  environment?: Record<string, string>;
  regions?: string[];
  supportsWrapper?: boolean;
  supportsResponseStreaming?: boolean;
};
```

**Fact:** this page does not enumerate a closed set of serverless runtime names. It illustrates `nodejs22.x`; Edge has a separate `runtime: 'edge'` definition. Its field table additionally documents `architecture: 'x86_64' | 'arm64'`, defaulting to `x86_64`. `handler` and `runtime` are required. `launcherType: 'Nodejs'` belongs to the Node-specific extension, not to every function. Omit `launcherType` for a custom native runtime; there is no documented `launcherType: 'Executable'`. The `.func` directory contains the function's files recursively.

**Fact:** `provided.al2023` is explicitly listed in the separate public [Runtime Developer Reference, `LambdaRuntime`, source lines 386–395][runtime-values]. The reference describes adding languages through third-party runtimes. Its older wrapper discussion still mentions `provided` and `provided.al2`; that is not a recommendation to target an old base image today. Current `@vercel/build-utils` implements:

```ts
export async function getProvidedRuntime(): Promise<'provided.al2023'> {
  return 'provided.al2023';
}
```

Source: [`packages/build-utils/src/provided-runtime.ts`, lines 1–14][provided-runtime]. The accompanying comment explicitly says deployment targets must be selected independently of the local build host. This matters for a macOS-produced prebuild.

**Fact:** `executable` is absent from the Build Output API's function examples and from that Runtime Developer Reference enumeration. It is nevertheless described by Vercel's public [runtime implementation guide, lines 109–121][fluid-guide] and emitted by public builders. The guide says: `Use runtime: 'executable'` and requires the handler name `executable`. It discusses `runtimeLanguage: 'rust' | 'go'`.

`runtimeLanguage` is optional in the actual `Lambda` type. If supplied, current build-utils validates only `rust` and `go`; `scriptc` is not accepted by that helper. See [`lambda.ts`, lines 245–261][lambda-validation]. This does not require falsely declaring scriptc as Go: the Swift packager omits `runtimeLanguage` altogether. [Swift config, lines 175–184][swift-package]. Whether omission gets identical infrastructure treatment on every account remains a hosted test question.

The documented [CLI prebuilt mechanism][prebuilt] uploads `.vercel/output`. There is no documented requirement to publish a language builder npm package when authoring Build Output API output directly.

### What the public upload/build-output code proves, and does not prove

The public reader loads `.vc-config.json`, collects files, recognizes Edge separately, and chooses `NodejsLambda` only when `launcherType === 'Nodejs'`; otherwise it calls:

```ts
new Lambda({ ...functionConfig, files, supportsResponseStreaming })
```

See [`read-functions.ts`, lines 272–325][function-reader]. The base Lambda constructor checks that `runtime` is a string, rather than enforcing a first-party language list. [Constructor, lines 245–261][lambda-validation]. The public writer serializes Lambda properties, including its runtime, into `.vc-config.json`. [`write-build-result.ts`, lines 930–952][function-writer].

The readable `read-functions.ts` copy is vendored under the CLI's describe implementation. I also checked the **published deploy command** in `vercel@65.8.0`: `dist/commands/deploy/index.js` contains the same `.vc-config.json` deserialization and generic `new Lambda(...)` branch. Its bundled/minified form is less useful for line citations; the source copy above makes the behavior reviewable.

**Inference:** the client/build-output path supports generic custom-runtime artifacts and does not require that `@vercel/go` produced them. **Limit:** this is not proof that Vercel's hosted API accepts every string or every account/runtime combination. Server-side validation and successful execution were not tested.

## 2. What Go, Rust, and Python package

### Go: there are two different paths now

**Handler-style Go functions:** the builder emits `handler: 'bootstrap'`, `runtime: await getProvidedRuntime()`, `runtimeLanguage: 'go'`, and `supportsWrapper: true`. [`packages/go/src/index.ts`, lines 317–325][go-package]. The template invokes `vc.Start(http.HandlerFunc(...))`; [`packages/go/main.go`, lines 9–30][go-main]. The public bridge calls `lambda.Start(handler)`, not `http.ListenAndServe`: [`go/bridge/bridge.go`, lines 137–158][go-bridge-handler]. This is an AWS Lambda Runtime API client compiled into the native bootstrap.

**Standalone Go HTTP servers:** current `@vercel/go` builds a Linux binary with `CGO_ENABLED=0`, then packages two executable files: a Vercel IPC proxy named `executable`, and the user's server named `user-server`. It uses `runtime: 'executable'`, `handler: 'executable'`, architecture, and response streaming. [`internals/ipc-proxy/src/index.ts`, lines 49–82][standalone-package]; the published `@vercel/go@27.0.0/dist/index.js` has the same packaging at lines 11272–11298 and the Go build settings at lines 15419–15424.

The proxy starts `./user-server` with `PORT` set, supplies the Vercel IPC lifecycle, and forwards ordinary HTTP. [`proxy.go`, lines 173–218 and 272–335][standalone-proxy]. Thus an HTTP server is sufficient **behind that bridge**, not in place of the bridge.

### Rust: separate the archived project from today's npm package

**Historical community runtime:** the archived `vercel-community/rust` source packages its compiled program as executable `bootstrap` with `runtime: await getProvidedRuntime()`. [`src/index.ts`, lines 104–119][community-package]. Its Rust library uses `lambda_runtime::run(handler).await`. [`crates/vercel_runtime/src/lib.rs`, lines 20–33][community-loop]. This is direct evidence of a third-party-maintained native custom runtime, using the Lambda event protocol rather than an arbitrary persistent HTTP server. The exact `provided.*` base selected historically depended on its build-utils dependency version; do not retroactively assume every old version emitted AL2023.

**Current official Rust runtime:** `@vercel/rust@25.0.0` packages its function binary as `executable`, sets `runtime: 'executable'`, `runtimeLanguage: 'rust'`, and enables streaming. Published `dist/index.js`, lines 1623–1636; current source is [`packages/rust/src/index.ts`][rust-source]. Its `vercel_runtime` 2.x library binds an HTTP server and connects to `VERCEL_IPC_PATH`. [`crates/vercel_runtime/src/lib.rs`, lines 296–321][rust-ipc]. Standalone Rust servers can use the same separate IPC proxy pattern as Go.

**Naming trap:** npm `vercel-rust@latest` currently resolves to **4.0.11**, published 2026-02-10. Its package metadata points to `vercel/vercel`, `packages/rust`, and it emits the newer `executable` configuration at `dist/index.js:402–414`. It is not the same source snapshot as the archived community repository. The deprecated repository and current npm package should not be conflated. [npm metadata][vercel-rust-registry], [published package source][vercel-rust-source].

### Python as a comparison

`@vercel/python@30.0.0` emits a Python runtime selected by its version resolver and a generated Python launcher, e.g. `handler: '${handlerPyFilename}.vc_handler'`, with architecture and streaming options. Published `dist/index.js`, lines 12348–12360 and 12963–12974. This is neither a generic native runtime nor evidence that an ELF file can be used as a Python handler. [Published source][python-source].

**Who may use these runtimes?** Custom runtimes are publicly documented as an extension mechanism. The historical community Rust runtime is a concrete precedent, and Swift supplies a direct prebuilt-output example. There is no first-party-builder-only restriction in the public function reader. However, the runtime's protocol still has to be implemented, and this investigation cannot certify hosted acceptance of our exact artifact.

## 3. Public native-binary precedents and their status

- **Community Rust:** the repository was archived on **2026-01-22**. Its README says “This community runtime is now deprecated” and says existing deployments continue functioning without further support or updates. [`README.md`, lines 18–35][community-status]. This supports “deprecated,” not a claim that native custom runtimes are broken or forbidden.
- **Official Rust:** Vercel announced its public beta on **2025-12-08**, explicitly as an evolution of the community runtime, with Fluid compute and streaming. [Dated announcement][rust-announcement]. The current [Rust documentation][rust-docs] still describes the supported Rust handler/crate route. This establishes public native-language deployment, not arbitrary scriptc compatibility.
- **Swift, particularly relevant:** `vercel-labs/swift-vercel-runtime` was created **2026-10-09** and had changes through **2026-10-27** when inspected. It builds static Linux Swift applications and a native bridge into `.vercel/output/functions/index.func`, writes `runtime: 'executable'`, `handler: 'executable'`, architecture and streaming, and tells users to run `vercel deploy --prebuilt`. It does **not** set `runtimeLanguage`. [`Plugin.swift`, lines 149–184][swift-package]; [`README.md`, lines 594–640][swift-readme]. This is public Labs code, not an official Swift runtime support commitment or independent proof that our deployment succeeds. Its importance is that the artifact pattern is almost exactly the proposed scriptc pattern.

I found no authoritative current statement declaring the custom-runtime mechanism itself deprecated. The replacement of community Rust with official Rust should not be used to infer that third-party native binaries are prohibited.

## 4. Next.js adapter integration and the actual Go prototype

### Current installed Next.js 16.4.3

Installed Next.js types at `node_modules/.pnpm/next@16.4.3_@types+node@20.19.43_react-dom@19.3.0_react@19.3.0__react@19.3.0/node_modules/next/dist/build/adapter/build-complete.d.ts` show:

- `SharedRouteFields.runtime` is only `'nodejs' | 'edge'`, line **30**. There is no shipped native runtime value in these installed types.
- `NextAdapter` has a name and optional `modifyConfig` and `onBuildComplete`, lines **326–395**. The latter receives routing, outputs, project/repository/dist directories, config, Next version, and build ID; it returns `void` or a promise, not a manifest to be auto-merged by Next.
- `dist/server/config-shared.js:189` defaults `adapterPath` from `NEXT_ADAPTER_PATH`. `dist/server/config.js:1158–1160` imports one configured module; `dist/build/adapter/build-complete.js:149–151,1401` calls that module's hook. There is no built-in list of adapters or composition chain.

These are read-only observations of the installed package. Current [Next adapter configuration docs][next-adapter-config] show top-level `adapterPath`, with `NEXT_ADAPTER_PATH` as the platform default. Older material, including the adapter repository README, uses `experimental.adapterPath`; installed 16.4.3 migrates that name at `dist/server/config.js:628`.

### Vercel's builder and adapter coexist, rather than being synonyms

`@vercel/next` is the framework builder. Its source gates the newer adapter path on `NEXT_ENABLE_ADAPTER === '1'`, then sets `NEXT_ADAPTER_PATH` to its bundled `adapter/index.js` and supplies Vercel config. [`packages/next/src/index.ts`, lines 525–533][next-builder-adapter]. The npm package `@vercel/next@28.0.0` contains that bundled adapter as well.

The separate public repository/package **does exist**: [`nextjs/adapter-vercel`][vercel-adapter-repo], published as `@next-community/adapter-vercel` (the inspected npm version is 0.0.0). The repository recommends automatic platform configuration rather than fixing a debugging copy into application config. Its adapter writes Build Output API output under `path.join(distDir, 'output')`. [`packages/adapter/src/index.ts`, lines 94–105][vercel-adapter-output]. The builder recognizes `.next/output/config.json` and returns that directory as `buildOutputPath`. [`@vercel/next` source, lines 618–657][next-builder-output]. This is distinct from the final upload directory `.vercel/output`.

**Inference for next-scriptc:** an explicit user adapter can replace the default selection, but that does not automatically preserve Vercel packaging. A composite adapter can call the platform adapter's `modifyConfig` and `onBuildComplete`, then add/replace native functions and adjust routing in its output. That follows the JavaScript interface mechanically; I found no official composition guarantee. Depending on a bundled `@vercel/next/dist/adapter` path or injected environment variable is a dependency on implementation details. A separate final-output postprocessing step after Vercel's standard build is another practical option; it must finish before the prebuilt upload. Avoid assuming files emitted early into `.vercel/output` will survive later builder output generation.

For all real Next.js pages, ISR, middleware/proxy, rewrites, dynamic routes, image settings, and static assets, preserve the platform output and its routing phases. Writing one native `.func` alone does not turn the rest of a Next.js build into deployable Vercel output. This is especially relevant when replacing a route that was grouped into a shared Node function.

### The Go prototype is public, but unmerged and partly host-dependent

I found **Next.js PR #100130**, opened **2026-10-13**, still open/draft and unmerged at inspection, head `e6932fa7da4d24152ce7291894bfe088271fffb5`. It adds `route.go` and emits independent `APP_ROUTE` outputs with `runtime: 'go'` and `filePath` pointing to a compiled native HTTP server. The adapter executable starts without arguments and listens on `PORT`; private self-hosted worker authentication is a separate contract. [PR and its author-written description][next-go-pr], [proposed route.go docs, lines 81–87][next-go-docs]. The PR description has been edited as the experiment evolved; the cited source commit fixes the code snapshot.

The matching **adapter-vercel PR #147**, opened **2026-10-26**, is also open/unmerged, head `453c1d08eae211ca164ddf35b86920e2db2f5a13`. Its proposed `go-outputs.ts` loads `NEXT_ADAPTER_VERCEL_GO_PACKAGER_PATH`, insists on an absolute module path and protocol version 1, and throws if unavailable. The host must provide exactly `executable` and `user-server`, with `runtime: 'executable'`, `handler: 'executable'`, `runtimeLanguage: 'go'`, architecture `x86_64`, and streaming enabled. [`go-outputs.ts`, lines 219–275][adapter-go-packager].

The producer PR links both that public adapter PR and `vercel/vercel-internal#2163`; an unauthenticated read of the latter returned **404**. The public PR descriptions report successful Vercel preview tests, but I did not run or independently verify those deployments.

**Conclusion about the demo:** it uses a host-provided native packager, not simply Next.js handing any binary directly to Vercel. Its public config mirrors the already-public standalone-server runtime. It demonstrates a possible integration design, not a released extension point for scriptc, and not proof that native function execution requires the private prototype packager.

## 5. The binary contract and scriptc compatibility

### Contract A: `provided.al2023`, Lambda invocation loop

AWS requires an executable `bootstrap` at the function root. It reads `AWS_LAMBDA_RUNTIME_API`, performs the initialization/error protocol, repeatedly gets `/2018-06-01/runtime/invocation/next`, and posts results to `/2018-06-01/runtime/invocation/{requestId}/response` or `/error`. This is a resident event-processing process, not a public HTTP listener. [AWS custom runtime contract][aws-custom].

For Vercel, implement the **Vercel event envelope**, not an assumed generic API Gateway proxy function. The public Go bridge takes an outer AWS `APIGatewayProxyRequest`, parses its **`Body` string as another JSON object**, and obtains `host`, `path`, `method`, `headers`, `encoding`, and `body`. Headers accept either a string or string array; request body decoding honors `encoding: 'base64'`. It returns an object with `statusCode`, array-valued `headers`, `encoding: 'base64'`, and the base64 body. [`bridge.go`, lines 15–45,69–104,121–158][go-bridge-full]. The old Rust implementation independently confirms this nested-body conversion. [Rust request loop][community-loop].

An illustrative successful response, for that buffered bridge contract, is:

```json
{
  "statusCode": 200,
  "headers": { "content-type": ["text/plain"] },
  "encoding": "base64",
  "body": "aGVsbG8="
}
```

`supportsWrapper: true` is valid only after implementing `AWS_LAMBDA_EXEC_WRAPPER` delegation. [Runtime wrapper reference, lines 222–274][runtime-wrappers]. Merely setting the flag does not add support. Similarly, do not enable `supportsResponseStreaming` and assume the buffered Lambda response loop will stream. AWS's custom streaming protocol and Vercel's bridge integration are additional contracts; the first experiment below deliberately uses buffered responses.

### Contract B: `executable`, HTTP plus Vercel IPC

The function entrypoint connects to the Unix socket in `VERCEL_IPC_PATH` and sends NUL-terminated JSON. It reports `server-started` with `httpPort` and initialization duration; serves HTTP on loopback; answers `/_vercel/ping`; extracts/removes internal invocation/request headers; and sends an `end` message for the corresponding invocation when request work finishes. Concurrent requests and streaming require correct lifecycle accounting. [Public guide, lines 17–90][fluid-guide], [working proxy implementation][standalone-proxy].

Example startup notification:

```text
{"type":"server-started","payload":{"initDuration":0,"httpPort":3000}}\0
```

Here `\0` denotes one NUL byte, not the two literal printable characters. Ordinary HTTP carries request/response headers and bodies; it is not the nested JSON event format above. A reusable native proxy can implement the IPC side and start the scriptc binary with `PORT`, letting scriptc handle ordinary HTTP and streamed body chunks. The Swift and standalone Go layouts both follow this architecture.

### Can scriptc implement it?

**Evidence from this checkout:** [platform documentation, lines 17–54](../vendor/scriptc/docs/content/docs/platforms.mdx) documents Linux x64/arm64, glibc and musl targets, native servers and TLS. [README, lines 59–67](../vendor/scriptc/README.md) uses `node:http.createServer`. [Unix-socket fixture, lines 14–45](../vendor/scriptc/tests/corpus/net-unix-socket-connect.ts) exercises `node:net` Unix socket connection/write/read. [HTTP fixture, lines 6–21](../vendor/scriptc/tests/corpus/http-server-listen-forms.ts) covers listener/address behavior. These are source/test fixtures, not tests executed during this investigation.

**Inference:** a small scriptc program can plausibly implement Contract A with `fetch`/`node:http`, JSON, buffers, environment variables and an async loop; or implement the HTTP side of Contract B with `node:http`. Implementing IPC directly additionally needs `node:net`; `fetch` by itself does not supply Unix-socket lifecycle signaling. Keeping the IPC proxy separate minimizes compiler-compatibility scope. Compile the precise bridge code before claiming compatibility; the presence of these APIs does not prove every needed overload or streaming/error path.

### Target and libc compatibility

- The compiler and runtime packs cover `linux-x64-gnu`, `linux-arm64-gnu`, `linux-x64-musl`, and `linux-arm64-musl`. GNU target definitions declare a glibc **2.34** baseline. [`targets.ts`, lines 348–399](../vendor/scriptc/packages/compiler/src/backend/targets.ts).
- The docs permit explicit GNU minima **2.34** (default) or **2.36**, with GNU executables dynamically linked. Musl targets produce statically linked executables. [Platform docs, lines 42–54](../vendor/scriptc/docs/content/docs/platforms.mdx).
- AL2023 uses glibc **2.34**; AL2 uses **2.26**. [AWS package comparison][al2023]. Consequently, a scriptc GNU 2.36 executable is not a safe AL2023 target, and GNU 2.34 should not be targeted at AL2. Source-level target labels do not replace inspecting the actual linked binary's required symbol versions and shared libraries.
- Cross-compilation uses Zig and the matching scriptc runtime pack. For an initial prebuild, prefer `SCRIPTC_TARGET=x86_64-linux-musl` with the x64 musl runtime pack, or deliberately target GNU 2.34 and validate dependencies. For arm64, use the corresponding aarch64 target and `architecture: 'arm64'`; test platform support independently.
- `--static` for host glibc is more constrained than musl static builds. scriptc rejects static glibc programs containing NSS lookups, including networking/fetch-related lookups; its diagnostic recommends musl. [`targets.ts`, lines 94–111,151–171](../vendor/scriptc/packages/compiler/src/backend/targets.ts). Static musl is the simpler portable networking target for this experiment. It does not bundle CA certificates or eliminate all environmental dependencies.

## 6. Concrete artifacts for a later deployment test

These are **proposed test artifacts**, not artifacts generated or deployed by this investigation. Start with an isolated native endpoint before integrating the whole Next.js router.

### A. More explicitly documented custom-runtime path

```text
.vercel/output/
├── config.json                       # { "version": 3 }
└── functions/
    └── api/
        └── native.func/
            ├── .vc-config.json
            ├── bootstrap             # executable shell launcher, mode 0755
            └── scriptc-runtime       # Linux ELF binary, mode 0755
```

`.vc-config.json`:

```json
{
  "runtime": "provided.al2023",
  "handler": "bootstrap",
  "architecture": "x86_64",
  "supportsWrapper": true,
  "maxDuration": 10
}
```

`bootstrap`, following the public wrapper pattern:

```sh
#!/bin/sh
if [ -n "${AWS_LAMBDA_EXEC_WRAPPER:-}" ]; then
  exec "$AWS_LAMBDA_EXEC_WRAPPER" "$LAMBDA_TASK_ROOT/scriptc-runtime"
fi
exec "$LAMBDA_TASK_ROOT/scriptc-runtime"
```

`scriptc-runtime` must implement Contract A, including the Vercel event envelope. It can invoke the compiled route logic in-process; it need not launch a Node.js worker. There is no `launcherType` or invented `runtimeLanguage: 'scriptc'`. Do not include a file named `executable` and expect the Fluid bridge to appear automatically under this configuration. Keep streaming disabled until separately implemented and verified.

### B. Closer match to the current local HTTP-server model

```text
.vercel/output/
├── config.json                       # { "version": 3 }
└── functions/api/native.func/
    ├── .vc-config.json
    ├── executable                    # Linux Vercel IPC proxy, mode 0755
    └── user-server                   # scriptc Linux HTTP binary, mode 0755
```

`.vc-config.json`:

```json
{
  "runtime": "executable",
  "handler": "executable",
  "architecture": "x86_64",
  "supportsResponseStreaming": true,
  "maxDuration": 10
}
```

Use a bridge implementing Contract B; the public Go IPC proxy is the reference. `user-server` listens on the assigned `PORT`. Alternatively, one scriptc `executable` could implement both IPC and HTTP. The Swift precedent supports omitting `runtimeLanguage`; do not pretend TypeScript was compiled from Go or Rust. Do not name an IPC bridge `bootstrap`: that name belongs to the direct Lambda runtime path and can bypass Vercel's own bootstrap. [Swift source comment, lines 327–334][swift-names].

This second layout best preserves an existing scriptc HTTP wrapper and offers a route to streaming. Treat the `executable` ABI and use of Vercel's bundled proxy as implementation dependencies until Vercel confirms their support status. A successful test would establish present functionality, not a long-term compatibility promise.

In a full Next.js deployment, merge the chosen function into the **completed** platform output and update its routing consistently with middleware/proxy and rewrite phases. The minimal `config.json` above is for the isolated function test only. The later upload command would be `vercel deploy --prebuilt`; it was not run here.

## 7. Questions left for a deploy test or Vercel

1. Does the hosted prebuilt validator accept the proposed `provided.al2023` artifact on an ordinary project/account with no internal flags? Does it also accept `executable` with omitted `runtimeLanguage`, as the public Swift example implies?
2. Is the public `executable` plus IPC protocol a supported third-party contract, and is there a versioned/publicly supported bridge distribution? Can scriptc be added as a runtime language, or should that optional metadata remain absent?
3. Which function base image, environment wrapper, architecture options, concurrency/Fluid features, and limits apply to custom `provided.al2023` versus generic `executable` functions today? Do large environment variables behave correctly with our wrapper?
4. Does the selected scriptc ELF start and perform DNS/TLS correctly in that image? Check executable modes, ELF architecture, loader/shared-library requirements, CA paths, filesystem assets and working directory.
5. Does the runtime preserve status codes, duplicate headers/Set-Cookie, binary bodies, errors, request cancellation, streaming/backpressure and concurrent request lifecycle? Does invocation completion stop billing at the intended point?
6. Which Next.js integration is recommended: adapter composition, a public native-output API, or postprocessing completed Build Output API output? Can Vercel expose the prototype's host packager as a supported package instead of an injected private integration?
7. For a mixed Next.js/scriptc app, are middleware/proxy, dynamic and encoded paths, rewrites, Node routes, static assets and caching behavior preserved after replacing the native route's output?

## Reproducibility and source snapshots

Remote code citations are pinned to inspected commits: `vercel/vercel` **84878e532142f0ac584953695658b324eb9e5b80**; `nextjs/adapter-vercel` **e1d596ed53f6a80334b2b43091f1bdd066b03586**; archived `vercel-community/rust` **dd0ba46aed5a6baeb5b65bbd915dde0408c42665**; `vercel/go-bridge` **cfc76d26d5540497473afcaf0575fc28fb87e970**; Swift **a7d44bf1068337fe24e86c2124340cc45ef57513**. The two experimental PR heads are cited separately above. Live docs and registry metadata can change after this date.

Each npm package was fetched with `npm pack --ignore-scripts` into its own newly created empty temporary directory and extracted with `tar -xzf`. No package code was run. Versions inspected: `vercel@65.8.0`, `@vercel/go@27.0.0`, `@vercel/build-utils@15.2.0`, `@vercel/next@28.0.0`, `@vercel/python@30.0.0`, `vercel-rust@4.0.11`, `@vercel/rust@25.0.0`, `@next-community/adapter-vercel@0.0.0`.

For the bundled-source line citations above, temporary package roots are beneath `/var/folders/4x/9xsch0y129j47fl92k4zx9cm0000gn/T/`:

- `native-research-vercel-m1osguoe/package` — deploy deserializer in `dist/commands/deploy/index.js`.
- `native-research-vercel-go-zn_bjron/package` — `dist/index.js:11272–11298,15419–15424,15862–15869`; `main.go:9–30`.
- `native-research-vercel-build-utils-cj7y7pbb/package` — `dist/provided-runtime.js:24–25`; `dist/lambda.js:110–121`.
- `native-research-vercel-next-5mb1wzkh/package` — `dist/index.js:18048–18054`; `dist/adapter/index.js:10646–10696,11424–11428`.
- `native-research-vercel-python-ow6yr57x/package` — `dist/index.js:12348–12360,12963–12974`.
- `native-research-vercel-rust-dqiwc3nb/package` — `vercel-rust`, `dist/index.js:402–414`.
- `native-research-vercel-rust-_wbwx7ng/package` — `@vercel/rust`, `dist/index.js:1623–1636`.
- `native-research-next-community-adapter-vercel-1k5boib6/package` — `dist/index.js`, package metadata.

These temporary copies may be cleaned later; pinned remote source and versioned package URLs provide the lasting references. Only this report was written inside the next-scriptc checkout.

[boa]: https://vercel.com/docs/build-output-api/primitives#serverless-function-configuration
[runtime-reference]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/DEVELOPING_A_RUNTIME.md
[runtime-values]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/DEVELOPING_A_RUNTIME.md#L386-L395
[provided-runtime]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/packages/build-utils/src/provided-runtime.ts#L1-L14
[fluid-guide]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/.claude/skills/vercel-runtime-implementation-guide.md
[lambda-validation]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/packages/build-utils/src/lambda.ts#L245-L261
[function-reader]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/packages/cli/src/util/describe/vendor/build-container/container/src/utils/build-output-api/functions/read-functions.ts#L272-L325
[function-writer]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/internals/builder-orchestration/src/write-build-result.ts#L930-L952
[prebuilt]: https://vercel.com/docs/cli/deploy#prebuilt
[go-package]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/packages/go/src/index.ts#L317-L325
[go-main]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/packages/go/main.go#L9-L30
[go-bridge-handler]: https://github.com/vercel/go-bridge/blob/cfc76d26d5540497473afcaf0575fc28fb87e970/go/bridge/bridge.go#L137-L158
[go-bridge-full]: https://github.com/vercel/go-bridge/blob/cfc76d26d5540497473afcaf0575fc28fb87e970/go/bridge/bridge.go
[standalone-package]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/internals/ipc-proxy/src/index.ts#L49-L82
[standalone-proxy]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/internals/ipc-proxy/bootstrap/proxy.go
[community-package]: https://github.com/vercel-community/rust/blob/dd0ba46aed5a6baeb5b65bbd915dde0408c42665/src/index.ts#L104-L119
[community-loop]: https://github.com/vercel-community/rust/blob/dd0ba46aed5a6baeb5b65bbd915dde0408c42665/crates/vercel_runtime/src/lib.rs#L20-L33
[community-status]: https://github.com/vercel-community/rust/blob/dd0ba46aed5a6baeb5b65bbd915dde0408c42665/README.md#L18-L35
[rust-source]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/packages/rust/src/index.ts
[rust-ipc]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/crates/vercel_runtime/src/lib.rs#L296-L321
[vercel-rust-registry]: https://registry.npmjs.org/vercel-rust
[vercel-rust-source]: https://unpkg.com/vercel-rust@4.0.11/dist/index.js
[python-source]: https://unpkg.com/@vercel/python@30.0.0/dist/index.js
[rust-announcement]: https://vercel.com/changelog/rust-runtime-now-in-public-beta-for-vercel-functions
[rust-docs]: https://vercel.com/docs/functions/runtimes/rust
[swift-package]: https://github.com/vercel-labs/swift-vercel-runtime/blob/a7d44bf1068337fe24e86c2124340cc45ef57513/Plugins/VercelPlugin/Plugin.swift#L149-L184
[swift-readme]: https://github.com/vercel-labs/swift-vercel-runtime/blob/a7d44bf1068337fe24e86c2124340cc45ef57513/README.md#L594-L640
[swift-names]: https://github.com/vercel-labs/swift-vercel-runtime/blob/a7d44bf1068337fe24e86c2124340cc45ef57513/Plugins/VercelPlugin/Plugin.swift#L327-L334
[next-adapter-config]: https://nextjs.org/docs/app/api-reference/adapters/configuration
[next-builder-adapter]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/packages/next/src/index.ts#L525-L533
[next-builder-output]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/packages/next/src/index.ts#L618-L657
[vercel-adapter-repo]: https://github.com/nextjs/adapter-vercel/tree/e1d596ed53f6a80334b2b43091f1bdd066b03586
[vercel-adapter-output]: https://github.com/nextjs/adapter-vercel/blob/e1d596ed53f6a80334b2b43091f1bdd066b03586/packages/adapter/src/index.ts#L94-L105
[next-go-pr]: https://github.com/vercel/next.js/pull/100130
[next-go-docs]: https://github.com/vercel/next.js/blob/e6932fa7da4d24152ce7291894bfe088271fffb5/docs/01-app/03-api-reference/03-file-conventions/route-go.mdx#L81-L87
[adapter-go-pr]: https://github.com/nextjs/adapter-vercel/pull/147
[adapter-go-packager]: https://github.com/nextjs/adapter-vercel/blob/453c1d08eae211ca164ddf35b86920e2db2f5a13/packages/adapter/src/go-outputs.ts#L219-L275
[aws-custom]: https://docs.aws.amazon.com/lambda/latest/dg/runtimes-custom.html
[runtime-wrappers]: https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/DEVELOPING_A_RUNTIME.md#L222-L274
[al2023]: https://docs.aws.amazon.com/linux/al2023/ug/glibc-gcc-and-binutils.html
