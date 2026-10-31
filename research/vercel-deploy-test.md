# Isolated scriptc / Vercel deploy test

Test date: 2026-10-31. Source baseline: `7877175911939e07306bab6184cd17a2cbe88d4b`.

## Result and limit

**Vercel accepted the native function artifact and reported READY, with `runtime: "executable"` and no `runtimeLanguage`. Correct execution as a hosted Vercel Function remains unverified.** Both deploy attempts were unexpectedly classified as production, including an explicit preview request. They were deleted without invoking the function. There is no retained deployment URL.

The exact Linux binaries subsequently passed HTTP and simulated Vercel IPC checks inside a Vercel Sandbox. That establishes that the cross-built scriptc server and upstream proxy run together on Linux; a Sandbox is not the hosted Functions invocation environment.

No Next.js fork, internal monkeypatch, adapter refactor, route change, project-setting change, git push, or merge was made. The only application route compiled was the existing demo `app/api/hello/route.ts`. The self-hosted flow is unchanged.

## Build and artifacts

Host: macOS arm64; Node 26.13.0; pnpm 11.1.3; scriptc 0.4.6; Zig 0.16.0; Go 1.27.3; Vercel CLI 65.8.0 (native).

`scripts/vercel-native-smoke.mjs` discovers `/api/hello`, calls `routes.mjs`'s `entrySource`, imports the existing `shim/serve.ts`, and calls `writeNativeConfig` for the demo's TypeScript aliases and `next/server` substitution. It generates the entry and compiler config in `examples/demo/.next/vercel-native-smoke/`. The compiler receives:

```text
SCRIPTC_TARGET=x86_64-linux-musl
SCRIPTC_RUNTIME_PACK=<temporary>/package
scriptc build <entry.ts> -o <hello.func>/user-server --optimization speed --strip --no-keep-llvm
```

The runtime pack is `@scriptc/runtime-linux-x64-musl@0.4.6`, fetched using `npm pack --ignore-scripts` into a fresh OS temporary directory and unpacked there. Its npm tarball SHA-1 was `9d8cf6132a631c6976ae20ed51e5bd096bf84875`. No dependency or lockfile change was needed. Zig is discovered through PATH. Cross-compilation worked; no Linux compilation fallback was necessary.

The bridge is the unmodified public [`internals/ipc-proxy/bootstrap`](https://github.com/vercel/vercel/tree/84878e532142f0ac584953695658b324eb9e5b80/internals/ipc-proxy/bootstrap) at commit `84878e532142f0ac584953695658b324eb9e5b80`. The script makes a fresh sparse Git checkout outside the repository, fetches that exact commit, and runs:

```sh
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o <hello.func>/executable .
```

Its `go.mod` declares Go 1.23 and no external module dependencies. Source and runtime-pack temporary directories are removed in `finally`; neither downloaded source nor binaries are committed.

Exact output:

```text
.vercel/output/
  config.json                           # {"version":3}
  functions/api/hello.func/
    .vc-config.json
    executable                          # 0755; 7,241,888 bytes
    user-server                         # 0755; 2,252,216 bytes
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

There is no `runtimeLanguage`, `launcherType`, wrapper, Node.js server, or custom routing config. The function's filesystem location supplies `/api/hello` routing. **The build script replaces `.vercel/output`; it is exclusively for this isolated test.**

`file` output (paths shortened):

```text
executable:  ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, Go BuildID=oC7_y-9QjRMFO9DU8ZCM/hjBLc4N4ONNkdtdv__nl/z-Gugt0w6JsdO9EgF28J/5Z3Gx18xqF56laaL2MbR, BuildID[sha1]=a8dfea392c322e7da7af30794063968b027cdd0f, stripped
user-server: ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
```

`llvm-readelf -l -d` found no `PT_INTERP` or dynamic section in either binary. The scriptc binary contains static musl; it needs neither `/lib/ld-musl-x86_64.so.1` nor a glibc installation. The Go proxy is built without cgo. Both still require compatible Linux kernel APIs; this route does not exercise DNS, outbound TLS, CA bundles, filesystem assets, or subprocesses from scriptc.

SHA-256 of the tested artifacts:

```text
acdabb85da02103ac5bce79e8ccda69e2bb26841153a4f3c8a667760e540bcfa  executable
ad89daf183173805908ab84c16b3361d4a5b598aedd46e89425c4ed9f2592a8b  user-server
```

A second full build produced the same hashes. They identify these runs, not a promise of byte-identical builds across compiler/toolchain versions or checkout paths.

## Deployment attempts and cleanup

The supplied `.vercel/project.json` and `.env.local` were copied into this worktree and remain ignored. Linked project: `next-scriptc` / `prj_loKFn5UhqXo1q4KesfMY8SZjQzEu`, team `team_9rYDB0tDX0ClFOCXmxrMd48y`.

First command:

```sh
vercel deploy --prebuilt --yes
```

It returned READY at `https://next-scriptc-n6iaos12p-noahs-projects-8a075d15.vercel.app`, deployment `dpl_4CpTQ6eHsBHh6V3ro6yPnNy1vqxM`. The CLI's exact message was:

```text
"target": "production"
"message": "Deployment next-scriptc-n6iaos12p-noahs-projects-8a075d15.vercel.app ready. Production URL: https://next-scriptc.vercel.app"
"hint": "This is the project’s first deployment, so it was assigned to production. Future deployments will be preview deployments unless you use --prod."
```

`vercel inspect <url> --json` independently showed `target: "production"`, `readyState: "READY"`, output path `api/hello`, runtime `executable`, 2048 MiB, timeout 10 seconds, and `deployedTo: ["iad1"]`. The runtime layer name contained `vercel-rusty-runtime-executable-1_51_16-production-f938d7ce24`. This is hosted packaging evidence, not invocation evidence or a guarantee about the underlying OS.

The deployment was immediately removed:

```sh
vercel remove dpl_4CpTQ6eHsBHh6V3ro6yPnNy1vqxM --yes
```

The retry used an explicit environment:

```sh
vercel deploy --prebuilt --environment preview --yes
```

It also returned READY with `"target": "production"`, at `https://next-scriptc-binjdrpiu-noahs-projects-8a075d15.vercel.app`, deployment `dpl_CW9mLP6PBhXFqXbutcxSbkgTj3N2`. It was also immediately removed:

```sh
vercel remove dpl_CW9mLP6PBhXFqXbutcxSbkgTj3N2 --yes
```

Both removal commands reported `Success! Removed 1 deployment`. The first deployment's inspection and both CLI results showed production assignment; `--prod` was never supplied. This nevertheless violated the intended preview-only outcome, so no further deployment was attempted.

Vercel's [merged CLI PR #17206](https://github.com/vercel/vercel/pull/17206) confirms that its API assigns a new project's first deployment to production even without `--prod`. **Inference:** deleting each deployment left the project in that initial state, explaining why the explicit-preview retry repeated it. The user did not authorize retaining or creating a production bootstrap.

After cleanup:

```sh
vercel api '/v6/deployments?projectId=prj_loKFn5UhqXo1q4KesfMY8SZjQzEu&teamId=team_9rYDB0tDX0ClFOCXmxrMd48y&limit=5'
```

returned:

```json
{"deployments":[],"pagination":{"count":0,"next":null,"prev":null}}
```

There was no hosted HTTP invocation, so no deployed GET/HEAD/405/query result, warm-instance reuse proof, Function cold-start number, `x-vercel-id`, or response region header was collected. `iad1` above is the inspected function placement. Both deploy results reported `vercel_authentication` protection; protection was not disabled. Duplicate Set-Cookie was not tested: the unchanged hello route emits no cookies.

## Linux HTTP and IPC verification

`scripts/vercel-native-sandbox-check.mjs` uploads those same two binaries to `vercel/sandbox/node:24` and starts the proxy against a small Node Unix-socket IPC receiver. This receiver simulates Vercel's control socket; it does not replace the Go proxy or route server. The test asserts responses and the exact invocation/request IDs in completion messages, then terminates the proxy process group and stops the Sandbox in `finally`.

The successful final run was in `emerald-applicable-wildcat-xRRLfD`, working directory `/vercel`, at 07:44:17 UTC. It produced:

```text
next-scriptc: listening on 127.0.0.1:35611
ipc {"type":"server-started","payload":{"initDuration":52,"httpPort":3000}}
spawn-to-IPC-ready-ms 102.33147400000001
```

Sequential checks through the Go proxy on port 3000:

- GET `/api/hello`: 200, `{"message":"Hello from next-scriptc!"}` (38 bytes).
- Second GET `/api/hello`: identical result in the same running proxy/server process, with no second startup message.
- HEAD `/api/hello`: 200, empty body, JSON content type; observed `connection: close`.
- POST `/api/hello`: 405, empty body, `allow: GET, HEAD, OPTIONS`.
- GET `/api/hello?greeting=1&greeting=2` with `accept-language: de`: 200, `{"message":"Hallo von next-scriptc!"}` (37 bytes). This shows query-bearing requests reach the route; hello does not read query values, so value preservation was not independently asserted.
- GET `/_vercel/ping`: 200, `OK`, handled by the proxy, with no invocation completion message.

All five route responses had `x-next-scriptc: native`. GET and HEAD had `content-type: application/json` and `vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, accept-language`. POST had the same Vary fields except `accept-language`. Each route request produced exactly one `end` message with contexts `smoke-0`/1 through `smoke-4`/5. The test observed one `server-started` message total and exited 0.

The proxy's 52 ms `initDuration` measures its own process startup through the child's TCP-listen readiness, including a 50 ms polling interval. A previous run measured 3 ms. The harness observes readiness on a separate 50 ms polling interval (102.33 ms final run; 52.50 ms previous run). Neither measures Lambda provisioning, external TTFB, nor complete route-module initialization. No hosted cold-start estimate can be derived from these numbers.

Three one-vCPU Sandboxes were created, each with a 120-second timeout and `persistent: false`; all were stopped. SDK-reported active CPU durations were 1475, 1998, and 1576 ms (5.049 seconds total, about 0.0014 vCPU-hours). Even their combined configured lifetime cap was 0.1 vCPU-hours, below the 0.3 budget.

## Bridge lifecycle and headers

Source facts from the pinned [`proxy.go`](https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/internals/ipc-proxy/bootstrap/proxy.go), [`utils.go`](https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/internals/ipc-proxy/bootstrap/utils.go), and [`ipc/`](https://github.com/vercel/vercel/tree/84878e532142f0ac584953695658b324eb9e5b80/internals/ipc-proxy/bootstrap/ipc):

- Connects to `VERCEL_IPC_PATH`; JSON messages are NUL-delimited and writes are mutex-serialized.
- Starts `./user-server`, supplies a free loopback `PORT`, forwards stdout/stderr, polls for TCP readiness, and supervises child exit. A dead child causes an `unrecoverable-error` and nonzero proxy exit.
- Advertises proxy HTTP port 3000 and initialization duration using `server-started`.
- Answers `/_vercel/ping` itself, before invocation accounting. The scriptc shim needs no ping route in this two-process design.
- Reads `X-Vercel-Internal-Invocation-Id` and the numeric `X-Vercel-Internal-Request-Id` into the request context, then strips **all** case-insensitive `x-vercel-internal-*` headers before forwarding to scriptc. Ordinary forwarded host/protocol headers remain available to the existing shim.
- Sends `end` after the HTTP handler finishes when an invocation ID exists. Upgrade handling ends the invocation once the upgrade handshake is flushed, with an exactly-once guard. Only the ordinary response path was tested here; streaming and upgrades were not.

With this upstream bridge, the shim only needs to remain a long-running HTTP server on the assigned PORT and finish each response. Implementing its own IPC, ping, or completion signaling would duplicate the bridge. The harness needed process-group termination to clean up both processes on SIGTERM; the upstream proxy does not install a SIGTERM forwarding handler. Hosted platform process cleanup was not tested.

## Failures and fixes

- Initial smoke-script config lacked `experimental: {}`. Next's config loader threw `TypeError: Cannot read properties of undefined (reading 'useTypeScriptCli')`. Passing the minimal expected config shape fixed this; no shared helper changed.
- The fresh pnpm install left compiler helper payloads nonexecutable, producing `error SC3004: TypeScript server startup: Permission denied`. Running scriptc's own `scripts/install-native.mjs` repairs the helper modes. An initial direct chmod of its two TypeScript helpers also passed that startup stage. This is installation setup, not a musl cross-compilation failure.
- Successful compilation emitted six `SC6104` warnings about checked-dynamic pieces in existing shim union types, including `warning SC6104: parameter 'module' (declared 'ModuleLoader') is held as a checked-dynamic value`. They were not promoted to errors; native compilation still succeeded. No interpreter/Node worker was packaged.
- A Docker availability check returned `Cannot connect to the Docker daemon at unix:///Users/noah/.docker/run/docker.sock. Is the docker daemon running?`. Docker was not needed and was not started.
- The first Sandbox check incorrectly assumed `/vercel/sandbox`. The SDK returned `Status code 400 is not ok: [internal] failed to start command: failed to receive started event: invalid_argument: failed to start process: chdir /vercel/sandbox: no such file or directory`. Using the SDK's actual `sandbox.cwd` (`/vercel`) fixed it; that Sandbox was stopped in `finally`.
- The next check passed HTTP/IPC assertions but terminating only the proxy left its child holding the command's stdout open. That Sandbox was explicitly stopped through the SDK. The final check spawns a separate process group and terminates the group, and completes normally with its `finally` stop.
- The hosted deploys were not rejected for runtime/config/ELF reasons. They reached READY but failed the preview-only requirement as described above. Both were removed. No claim of successful hosted execution is made.

## Reproduce and resume

From the workspace root, with Node 24+ and the pinned tool versions above:

```sh
pnpm install --frozen-lockfile
# If install scripts did not repair executable modes:
node packages/next-scriptc/node_modules/scriptc/scripts/install-native.mjs
PATH=/Users/noah/.local/share/zig-0.16.0:$PATH node scripts/vercel-native-smoke.mjs
node --env-file=.env.local scripts/vercel-native-sandbox-check.mjs
```

Use your Zig directory on other hosts. Go, Git, npm, tar and file must also be on PATH. The Sandbox check uses the existing ignored OIDC environment file; refresh that file if authentication expires. The packaging script itself needs no Vercel credentials.

**Do not retry deployment on this empty project under a preview-only instruction.** Resume with a user-authorized project that already has a deployment baseline, or after the user separately resolves the first-deployment restriction. Retaining a production bootstrap is outside this task's authorization. Once that prerequisite is satisfied:

```sh
vercel deploy --prebuilt --environment preview --yes
vercel inspect <deployment-url> --json
# Confirm target is not production before invoking anything.
vercel curl 'https://<deployment-host>/api/hello' -- --silent --show-error --include --write-out '\nTTFB=%{time_starttransfer} total=%{time_total}\n'
vercel curl 'https://<deployment-host>/api/hello' -- --silent --show-error --include
vercel curl 'https://<deployment-host>/api/hello' -- --silent --show-error --head
vercel curl 'https://<deployment-host>/api/hello' -- --silent --show-error --include --request POST
vercel curl 'https://<deployment-host>/api/hello?greeting=1&greeting=2' -- --silent --show-error --include --header 'accept-language: de'
vercel logs --deployment <deployment-url> --json
```

Use the full deployment URL: path-only `vercel curl` defaults to production. The CLI supplies protection bypass using the existing login. Capture the first request immediately after deploy, then the second, retaining headers (especially `x-vercel-id`) and logs. Client TTFB includes networking and is only a rough cold-path observation; confirm initialization/instance identity from logs if exposed. Add explicit per-instance diagnostics in the smoke entry if logs cannot distinguish warm reuse. The commands in this paragraph are the remaining hosted verification procedure, not commands already run successfully.

## Requirements for the combined adapter

The following are implementation implications, not results verified by this isolated deployment:

1. Compose Vercel's Next adapter hooks and preserve its completed Build Output, then replace the selected native routes' function/routing entries. Keep static assets, Node routes, middleware/proxy, redirects, rewrites, caching phases, and prerender/ISR metadata. Account for route grouping instead of deleting a shared Node function wholesale.
2. Compile for the deployment architecture rather than the build host. Resolve a matching pinned scriptc target/runtime pack and package both executable files with 0755 modes. Cache the upstream proxy per source commit, Go toolchain and architecture; it is larger than this route binary and need not be rebuilt for every route.
3. Apply the exact tested executable config without inventing a `runtimeLanguage: "scriptc"`. Forward platform duration/memory/region settings deliberately. Generic executable metadata was accepted here, but the IPC contract's long-term third-party support status is still an open question.
4. Run hosted invocation verification before claiming the integration works. Test stream completion/cancellation, duplicate Set-Cookie, binary bodies, request bodies, concurrency, failures, dynamic/encoded paths, public URL reconstruction, DNS/TLS/CA paths, and assets. `supportsResponseStreaming: true` in accepted metadata does not prove all of those behaviors.
5. Keep the existing self-hosted spawn/rewrite flow separate from Vercel's lifecycle. Native workers on Vercel are started by `executable`, not by a `next start` process.

The immediate open question is whether these exact accepted binaries execute correctly under the hosted Functions supervisor. Preview targeting on this empty project must be resolved before that question can be answered within the stated constraints.
