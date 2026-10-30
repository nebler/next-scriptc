# App Router compilation probe

Eight realistic route modules use the Next.js 16 asynchronous `context.params`
signature. Each has a direct-call entry with fixed requests, including validation
failures. No Next server or scriptc vendor build is involved.

Install from the workspace root with `pnpm install --filter probe`. Run:

```sh
PROBE_NODE=/path/to/node24 node examples/probe/run.mjs
```

On this machine the Node 24 executable is
`/Users/noah/.local/share/fnm/node-versions/v24.22.0/installation/bin/node`.
If the runner itself runs under Node 24, `PROBE_NODE` is optional.
Use `--only=query,headers` to run a subset, or `--only=next-shim` for the
experimental local compatibility shim. Builds run sequentially with the installed
`packages/next-scriptc/node_modules/.bin/scriptc`, default release optimization,
and `--no-keep-llvm`. Coverage has a four-minute timeout, builds five minutes,
and each program fifteen seconds. Timeout/interruption kills the process group.
The runner disables persistent compiler checker servers and owns/closes its
loopback upstream server. The fetch handler never calls a public upstream.

`.artifacts/` is ignored and holds coverage/build logs, exact Node/native streams,
command arguments, exit codes, signals, binaries, and unified `parity.diff` files.
Each selected case's old directory is replaced on rerun. Compiler build cache
also stays inside `.artifacts/`. `summary.json` records the eight-route run;
subset runs get separate summary filenames. Expected build refusals exit zero;
a parity mismatch or unsuccessful Node reference exits one.

The comparison is byte-for-byte over each entry's stdout/stderr plus exit code
and signal. The entries print status, alphabetically sorted response header
strings, and the complete body. Sorting does not test header insertion order.
The crypto entry validates the random `x-request-id` as UUID v4, then prints
`<uuid-v4>` so two independent random values do not create a false mismatch.
Its digest/body is compared exactly. This is a deterministic direct-call probe,
not a claim of exhaustive byte parity across HTTP serialization, randomness,
error stacks, stream scheduling, or all request inputs.

Node's ESM resolver does not accept Next's extensionless `next/server` subpath.
`node-resolve.mjs` maps that one specifier to the installed `next/server.js`,
retaining the real Next implementation. This emulates framework resolution only;
it does not replace Next with the shim in the baseline. scriptc receives the
original extensionless import. The optional shim probe uses a separate local
module and a copy of the same handler.

See [RESULTS.md](./RESULTS.md) for measured results, limitations, and bug repros.
