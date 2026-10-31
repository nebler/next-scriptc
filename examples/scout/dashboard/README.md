# Dashboard scout

One stored JSON export → parse → filter → group by day/region → sum → sort.
`dashboard.ts` is the same file in Node and scriptc. `dashboard.go` supports
typed stdlib Unmarshal, typed streaming Decoder, and direct stdlib v2 Unmarshal.
No HTTP, Next, cached results, custom parsers, or compiler changes.

From the repository root on this Mac:

```sh
export PATH=/Users/noah/.local/share/fnm/node-versions/v24.22.0/installation/bin:$PATH
pnpm install --frozen-lockfile
# Needed if pnpm skipped scriptc's install hook / helper executables lack +x:
node node_modules/.pnpm/scriptc@0.4.6/node_modules/scriptc/scripts/install-native.mjs
node examples/scout/dashboard/run.mjs
node examples/scout/dashboard/profile.mjs
```

Defaults: 10 warmups + 40 measured calls per runtime and size; separate phase
profile at 200k. Builds are release scriptc and ordinary optimized Go. Configure
`NODE`, `GO`, `ITERATIONS`, `WARMUP`, `SIZES`, `RESULT`, `SKIP_BUILD`, `PROFILES`.
Go v2 requires the installed Go 1.27 toolchain (or an appropriate earlier
toolchain with the JSON v2 experiment enabled).

For a **single** Linux confirmation (default hard cap 0.048612 vCPU-hours):

```sh
cp /Users/noah/code/next-scriptc/.env.local .env.local
node --env-file=.env.local examples/scout/dashboard/sandbox.mjs
```

Credentials stay in the ignored local file; only source and a cross-compiled
Go executable enter the VM. The controller always stops the Sandbox in finally.
Use `LIFETIME_MS` and `LABEL` for a separately budgeted follow-up; do not repeat
the default within a shared 0.05 vCPU-hour allowance. The retained two runs used
175000 ms, then 105000 ms after the first stopped at 69122 ms, and cost a combined
conservative 0.041649 vCPU-hours.

Generated fixtures, LLVM, binaries and profiler intermediates are ignored under
`.artifacts/`. The report and retained evidence are `research/scout-dashboard*`.
