# Repeat CO1 locally

Use Node 24.22.0, npm, clang, Zig and matching Node headers. Run from the worktree root:

```sh
npm pack ./packages/scriptc-promote --pack-destination research/prototypes/container-offload
cd research/prototypes/container-offload
npm install --no-package-lock --no-audit --no-fund
node node_modules/scriptc/scripts/install-native.mjs
node build.mjs
node --test forward.test.mjs
```

Build outputs are ignored. The locally packed promotion package is intentional. Do not install dependencies in the main checkout. `build.mjs` compiles a stock wasm reactor and both Nitro presets. The Node adapter discovers only `compute/`. Keep the repository's existing compute-only WASI bridge at its relative path.

Start three shells in this directory:

```sh
PORT=18992 HOST=127.0.0.1 node .output/server/index.mjs
PORT=18993 HOST=127.0.0.1 SCRIPTC_PROMOTE=0 node .output/server/index.mjs
WRANGLER_SEND_METRICS=false node node_modules/wrangler/bin/wrangler.js dev --local --config wrangler.local.json --port 18991
```

Run `node probe.mjs` to warm and train the automatic dispatcher. Confirm `/state` reports `native`, with no fallbacks. Locate both workerd PIDs and the Node AUTO and JS PIDs using `ps -axo pid,ppid,command`. Then run:

```sh
node measure.mjs FRONT_WORKER_PID APP_WORKER_PID NODE_AUTO_PID NODE_JS_PID
node extra.mjs
node smoke.mjs
```

`measure.mjs` is macOS-specific because it uses the existing `research/wasm-workerd/cpu.py` libproc sampler. The final source asserts the wasm response header. The original retained timing predates that diagnostic addition. `extra.mjs` records additional controls in the same JSON. `/binding` reaches an empty local KV; no hosted namespace is used. `?lane=worker` bypasses forwarding, `?compute=wasm&lane=worker` selects wasm, and `?fail=1` simulates a refused connection. These query overrides are for research only.

The Container worker is `worker.mjs`, with `wrangler.json`. Its cold-state branch is unexecuted. The Dockerfile and Dockerfile-specific ignore file use the repository root as build context. When a Docker daemon is available, the plain-Docker fallback can be built and run from the repository root:

```sh
docker build --platform linux/amd64 -t nsc-co1-app:local -f research/prototypes/container-offload/Dockerfile .
docker run --name nsc-co1-node -p 127.0.0.1:18992:8080 nsc-co1-app:local
```

Run a second container named `nsc-co1-js` on port 18993 with `-e SCRIPTC_PROMOTE=0`. Both Docker execution and amd64 emulation performance remain untested. On arm64 macOS, emulation does not predict production CPU performance. The full Wrangler Containers path additionally has DO state and fetch hops, so the HTTP fallback cannot measure it. Wrangler chooses its own local Docker resource names; do not run that path under the task's strict prefix constraint without first ensuring the tooling can enforce it. The actual attempted run stopped at the missing daemon and created no artifacts.

Stop task servers and remove only task resources:

```sh
docker rm -f nsc-co1-node nsc-co1-js
docker rmi nsc-co1-app:local
rm -rf node_modules .output .nitro .build .wrangler scriptc-promote-0.0.0.tgz
```

Do not run the Docker cleanup commands unless those exact resources were created by your run. Never prune shared Docker resources. The report's run created none. Never use deploy, login or account commands for this experiment.
