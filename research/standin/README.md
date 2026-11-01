# Run the local stand-in

From this worktree, run:

```sh
research/standin/run.sh revenue my-window
```

The command cross-builds missing binaries, builds the small `nsc-standin:node24` image, creates a new container, measures revenue, and removes that container on exit. It writes samples, warmups, host load, and container settings to `research/standin/raw/my-window-*`. A label cannot overwrite an existing result. Run one measurement at a time and keep builds outside measurement windows.

Requirements are Docker Desktop, npm, Node 24 or newer for build-time type stripping, Zig 0.16.0, stock scriptc 0.4.6, and Node 24 C headers. Defaults use this host's existing stock compiler and header cache. Override `SCRIPTC` and `NODE_HEADERS` on other machines. Runtime packs download into this worktree's ignored `.checks/standin`, never either scriptc source checkout. The runtime image pins Node 24.22.2 by manifest digest.

`STANDIN_CPU=0` selects the Docker Linux VM's logical core, not a fixed physical Apple performance core. Quota is one CPU, memory and memory-plus-swap are both 2 GiB. Two idle-capable probe runtimes share that same quota. The real sidecar and addon stay alive across all sizes. Echo measurements run separately after each revenue bucket. The dispatcher of the measured revenue sidecar is A2's exact dispatcher.

For x64 correctness only, run:

```sh
research/standin/run.sh correctness my-x64-check
```

The x64 container uses emulation. Its retained rows contain hashes only. Never analyze its execution speed.

To rebuild after changing workload sources, remove only `.checks/standin/arm64/{functions,echo-functions,revenue.node,boundary.node}` and `.checks/standin/x64/revenue.node`, or run `node research/standin/build.mjs` with the already extracted packs. The harness rebuilds missing binaries. It does not detect source changes automatically.

Each revenue run retains 15 warmups and 60 measured calls per variant and size. CPU includes every Node thread via `process.cpuUsage()`. Sidecar CPU adds execution nanoseconds summed from `/proc/PID/task/TID/schedstat`; hashing and counter reads are outside wall timers. Do not replace these counters with coarse per-call stat ticks. Require readable, nonzero schedstat counters on a different Docker kernel.

The addon no-op parses the original arguments, looks up a cached typed result, strictly validates and encodes it, and returns through the same serialized owner-thread shim. The sidecar no-op uses a separate binary with the same cached result and full RPC encoding. Both verify every response against Node. Cache lookup is counted as boundary overhead. Node's model boundary is zero because its direct application call has no serialized interface. Its measured JSON parse diagnostic is retained but unused.

`python3 research/standin/analyze.py` regenerates the committed calibration from final windows 5 and 6 and A2's hosted samples. Python's standard library is sufficient. Change the explicit input window list when performing a new calibration. Keep old windows and document methodological changes. Extend `measure.mjs` with another named workload when adding experiments; keep quota, CPU accounting, hash checks, rotation, and raw evidence.

Use the factors and limits in [the calibration report](../standin-calibration.md). Predicted hosted wall time from local CPU is a proxy, not measured or calibrated Vercel Active CPU. Recalibrate at every hosted checkpoint. Boundary changes and architecture-specific changes require hosted confirmation.
