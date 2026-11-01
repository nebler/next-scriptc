# The hill: plan and measurement rules

2026-11-01. This document governs how we climb from here. It also accounts for the Vercel team's soft block (Fast Origin Transfer fair-use limit, blocked 2026-11-01 11:49 UTC, auto-lift 2026-12-01).

## End goal

Install the adapter, change no application code, and a real open-source app on Vercel uses measurably less CPU, with byte-identical responses. Every scriptc gap we hit along the way is fixed and recorded in the [patch ledger](scriptc-patches.md) for upstreaming.

- **Hill 2 (product, main line):** automatic native promotion ([design](auto-promotion-design.md), [first results](auto-promotion-results.md) on branch `t3/automatic-native-promotion`).
- **Hill 1 (compiler, alongside):** scriptc fixes, prioritized by what Hill 2 hits.
- **Benchmarks:** our demo workloads are the daily set. **Papermark** `documentViewDistribution` ([real-app-targets.md](real-app-targets.md)) is the held-out proof; the climb never tunes against it.

## Why local results need adjusting

| Difference | Local (M4 Pro) | Vercel iad1 Function |
| --- | --- | --- |
| Architecture | arm64 (NEON) | x86-64 (AVX2) |
| CPUs | 12 fast cores | about 1 vCPU, shared with Node's threads |
| Boundary costs | cheap | much more expensive (A2: the sidecar won 5k locally, lost on Vercel) |

## The local stand-in

- Linux **arm64** container, `--cpus=1` pinned to one core (`--cpuset-cpus`), 2 GB memory, Node 24, the same scriptc and runtime-pack versions as the hosted runs.
- An x86-64 container under emulation is used **only for correctness**: does the linux-x64 addon load, and are results identical. It is never used for speed.
- New containers only. The user's existing Docker containers (Supabase) are never touched.

## Calibration

1. Rerun the exact [A2](use-native-napi-vercel.md) workload in the stand-in: Node, sidecar, addon sync and async, at 1k, 5k, 15k and 200k, with the same iteration structure.
2. Use the timing per stage to split each measurement into **compute** and **boundary** (encoding, copying, call overhead, scheduling).
3. Fit two factors so that *predicted Vercel = compute × f_compute + boundary × f_boundary*. Report the fit error per cell and the uncertainty of each factor.
4. **Recalibrate at the start of every hosted checkpoint.**

The calibration rests on one A2 dataset (n = 60 per cell, one deployment), so the factors carry error. Treat predictions as steering tools, not results.

## Metric

- **Primary:** predicted Vercel **CPU time** saved on the mixed workload (70% 1k, 20% 5k, 10% 200k events) vs plain Node. Measure with `process.cpuUsage()`, which includes the native owner thread. Vercel bills Active CPU, and CPU time transfers better than wall-clock time.
- **Always also reported:** raw local CPU and wall time per bucket, and the median and p95.
- **Hard guardrails on every step:**
  - byte-identical results;
  - existing tests pass;
  - for compiler changes, scriptc's focused tests pass, and the full local gate passes before a patch is marked ready.

## Rules for the climb

- **One hypothesis per step.** Log the hypothesis, change, result, and whether it was kept or reverted in `research/hill-log.md`.
- **Count a step as an improvement only if it beats the calibration error.**
- **Changes whose gain comes mainly from boundary costs** (the factor with the biggest local/Vercel difference) are marked **needs hosted confirmation**.
- **Architecture-specific compiler changes** (SIMD, vectorization) are marked the same way.
- **The held-out Papermark workload is measured only at milestones,** never used to tune.

## Low-transfer rules for any Vercel run

The soft block came from Fast Origin Transfer, meaning request and response bodies between the edge and Functions. Every hosted run must:

1. **Return hashes and timings, not bodies.** The Function computes the result, verifies its SHA-256 itself, and returns a few hundred bytes.
2. **Batch inside the Function.** One request runs many iterations and returns the statistics.
3. **No client Function fetches large bodies** from other Functions.
4. **Estimate transfer before the run** (requests × bytes in and out) and keep it under a stated budget; the default budget is 50 MB per run. Check the dashboard's Usage → Fast Origin Transfer before and after.
5. **Use the fewest hosted runs possible.** The local stand-in does the climbing; Vercel gets checkpoints.

On Pro, set a Spend Management cap before the first run.

## Hosted checkpoints (after the upgrade or 2026-12-01)

1. Recalibrate by rerunning A2 with the low-transfer harness.
2. Check the predictions made since the last checkpoint and record how far off they were.
3. Run the milestone measurements.

**Published numbers come only from Vercel.**

## Order of work now

1. **C1, calibration:** stand-in, A2 rerun, factors.
2. **Phase 1, boundary encodings,** in parallel with C1 (implementation and unit tests only; its measurements wait for C1's harness):
   - encodings per type (raw strings, typed arrays, direct numbers);
   - timing per stage;
   - the shared-core and host-packaging split.
3. **Phase 1 measurement** in the calibrated stand-in, with its gate: with real data passed as arguments, predicted native beats JS from 5k up.
4. **The int8 local test gate,** only when no measurement is running.
5. **The local Papermark gate.**
