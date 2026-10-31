# Vercel route benchmark

Node/native comparison; status: **complete**. 2026-10-31T08:48:45.310Z.

Client: v24.22.1, linux/x64; Sandbox copper-legislative-elk-DdC6CV in iad1, 2 vCPUs.

Source commit: ea0c8595bddb65f8f9c30d446a3cc40cda2b2228. Uploaded client files: SHA-256 9b901bcfd71bf1a42d964b616c394d93bedcc9445e94ec47139774456e73c91e. Working tree dirty at upload: true.

HTTPS HTTP/1.1 closed loop, no pipelining/retries. Fixed registry fixtures; gzip parity uses decoded bytes. Dispatch-to-drained-body latency excludes decoding/digest checks; throughput includes their client cost. C=1: 20 warmup + 200 measured. Protocol revision 2. C=16: up to 2 s / 1,000 warmup + 3 s / 900 measured, on the warmed pool. Quantiles use nearest rank; 200 samples offer weak p99 evidence. No open-loop capacity or external-user latency claim.

First rows are route-first responses before warmup, including DNS/TCP/TLS. Only hello is deployment-first; shared functions can already be warm for other routes. Freshness is operator-declared. Confirmed process-cold time, server duration and whole-instance used memory are unavailable unless independently supplied by platform observability; diagnostic process RSS is separate. x-vercel-id identifies request/regions, not cold state. No assumed idle eviction timeout.

- node: https://next-scriptc-oh4dr4zl9-noahs-projects-8a075d15.vercel.app; operator-declared untouched fresh deployment.
- native: https://next-scriptc-fdcxfd5ec-noahs-projects-8a075d15.vercel.app; operator-declared untouched fresh deployment.
  Server: dpl_5ViN9ue9gqhYj3NzAkbkP2mSo67E; target=preview; hello runtime=nodejs24.x, region=iad1, allocated memory=2048 MiB (not used memory). Full function mappings are in JSON.
  Server: dpl_EH6tkGHBif54mcEMsVByknxCQqGv; target=preview; hello runtime=executable, region=iad1, allocated memory=2048 MiB (not used memory). Full function mappings are in JSON.

Project Fluid setting observed at 2026-10-31T08:48:45.309Z: true. This is a control-plane observation, not per-request start evidence.


Every metric cell is value; variant/Node ratio. Lower is better for latency, higher for req/s. Ratios require two validated variants; baseline-only is unavailable. Failed rows invalidate comparisons. Client CPU ≥0.8 cores flags suspected generator saturation; count-limited windows are not sustained capacity.

| Workload | Variant | First ms; ratio ↓ | C=1 p50 ms; ratio ↓ | p95 ms; ratio ↓ | p99 ms; ratio ↓ | C=16 req/s; ratio ↑ | C=16 p50/p95/p99 ms; ratios ↓ | C=16 count / elapsed ms | CPU cores / saturated / capped | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hello | node | 228.315; 1.000× | 24.260; 1.000× | 36.442; 1.000× | 55.161; 1.000× | 603.073; 1.000× | 23.573; 1.000× / 41.515; 1.000× / 88.147; 1.000× | 900 / 1492.357 | 0.180 / false / true | measured |
| verify | node | 87.329; 1.000× | 23.044; 1.000× | 38.083; 1.000× | 45.436; 1.000× | 502.189; 1.000× | 21.736; 1.000× / 38.285; 1.000× / 61.098; 1.000× | 900 / 1792.153 | 0.156 / false / true | measured |
| revenue | node | 62.483; 1.000× | 25.739; 1.000× | 41.230; 1.000× | 53.513; 1.000× | 525.744; 1.000× | 26.101; 1.000× / 44.772; 1.000× / 90.593; 1.000× | 900 / 1711.860 | 0.236 / false / true | measured |
| gzip-export | node | 69.181; 1.000× | 29.779; 1.000× | 45.629; 1.000× | 69.112; 1.000× | 408.193; 1.000× | 30.609; 1.000× / 50.937; 1.000× / 98.558; 1.000× | 900 / 2204.839 | 0.856 / true / true | measured |
| nearby-stores | node | 89.594; 1.000× | 23.895; 1.000× | 44.783; 1.000× | 56.382; 1.000× | 586.141; 1.000× | 23.304; 1.000× / 44.352; 1.000× / 75.826; 1.000× | 900 / 1535.467 | 0.189 / false / true | measured |
| markdown | node | 144.555; 1.000× | 22.286; 1.000× | 38.681; 1.000× | 54.620; 1.000× | 630.490; 1.000× | 22.168; 1.000× / 36.497; 1.000× / 55.070; 1.000× | 900 / 1427.462 | 0.269 / false / true | measured |
| hello | native | 850.077; 3.723× | 24.744; 1.020× | 41.480; 1.138× | 63.462; 1.150× | 622.151; 1.032× | 21.624; 0.917× / 38.037; 0.916× / 56.231; 0.638× | 900 / 1446.595 | 0.163 / false / true | measured |
| verify | native | 53.382; 0.611× | 23.609; 1.024× | 54.919; 1.442× | 193.498; 4.259× | 617.875; 1.230× | 22.147; 1.019× / 42.234; 1.103× / 82.774; 1.355× | 900 / 1456.606 | 0.178 / false / true | measured |
| revenue | native | 45.008; 0.720× | 24.276; 0.943× | 44.360; 1.076× | 54.058; 1.010× | 588.019; 1.118× | 23.652; 0.906× / 41.832; 0.934× / 69.760; 0.770× | 900 / 1530.563 | 0.253 / false / true | measured |
| gzip-export | native | 92.023; 1.330× | 27.239; 0.915× | 45.399; 0.995× | 157.467; 2.278× | 437.490; 1.072× | 30.096; 0.983× / 47.405; 0.931× / 96.588; 0.980× | 900 / 2057.189 | 0.925 / true / true | measured |
| nearby-stores | native | 55.880; 0.624× | 21.840; 0.914× | 39.192; 0.875× | 52.341; 0.928× | 556.994; 0.950× | 23.639; 1.014× / 49.691; 1.120× / 104.591; 1.379× | 900 / 1615.816 | 0.152 / false / true | measured |
| markdown | native | 83.006; 0.574× | 64.066; 2.875× | 84.261; 2.178× | 152.916; 2.800× | 82.804; 0.131× | 132.580; 5.981× / 445.802; 12.215× / 526.191; 9.555× | 275 / 3321.079 | 0.042 / false / false | measured |

Issued requests (includes warmup/first/failures): 23318. Provisioned Sandbox upper bound: 0.074 vCPU-h. Platform active CPU: 32358.000 ms (not the provisioned upper bound).

Shared-Function diagnostic process RSS is in JSON (memoryAfterFirst / memoryAfterLoad); each response may reach any instance. Native user-server excludes the Go proxy. Whole-instance memory and platform peak remain unavailable. Function limits are not RSS.

Deployment provenance / resource settings are supplied in the sibling metadata JSON when available; equality must be checked before interpreting native/Node differences. Baseline-only evidence cannot establish a native speedup. All losses, failures, count caps and omissions remain visible.
