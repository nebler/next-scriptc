# Historical Vercel controllers

These scripts preserve the one-time 2026-10-31 experiments and their recovery
procedures. They are not general benchmark entry points. Use the
[current harness](../README.md), [final report](../../../../../research/vercel-final.md)
and [startup investigation](../../../../../research/vercel-cold-start-memory.md)
for protocols, failures and interpretation.

- `final-run.mjs`: original five-pair controller.
- `final-recover.mjs`: recovery of the recorded pair-2 upload failure.
- `final-cpu-recover.mjs`: derivation of the CPU reference after the Sandbox stop timeout.
- `startup-*`: instrumented build, public proxy, deployment, request, scale-out
  and Sandbox probes for the earlier separate-proxy implementation.
- `cold-file.c`: advisory page-cache eviction helper for the startup probe.

Run paths are relative to the repository root. The startup instrumentation targets
the historical shim and ignored `.vercel/round2` artifact layout; it is not
compatible with every subsequent shim revision. Recovery controllers require the
exact recorded commit/state and are intentionally unsuitable for a fresh run.

Frozen provenance JSON still records original paths and hashes. Resolve an old
`examples/demo/bench/vercel/<name>` controller path here, or use the source commit
named in that artifact. Only filesystem-relative imports/root discovery changed
when these files moved; historical measurement JSON and its hashes are unchanged.

`function-sizes.py` stays in the parent directory because both the final and I/O
controllers use it. Report generators, clients, deploy/build tools, CPU/memory
checks and harness tests also remain there.
