# Vercel route benchmark

Node/native comparison; status: **failed**. 2026-10-31T10:23:22.033Z.

Client: v24.22.1, linux/x64; Sandbox cyan-advisory-bovid-LW6JWK in iad1, 2 vCPUs.

Source commit: 10d23f6d4487cdf213a871cf8491202b9f83a494. Uploaded client files: SHA-256 264b8042d02dbecd010dc7b02662556d42549b23feb1485cf7f990767281a59f. Working tree dirty at upload: true.

HTTPS HTTP/1.1 closed loop, no pipelining/retries. Fixed registry fixtures; gzip parity uses decoded bytes. Dispatch-to-drained-body latency excludes decoding/digest checks; throughput includes their client cost. C=1: 20 warmup + 200 measured. Protocol revision 2. C=16: up to 2 s / 1,000 warmup + 3 s / 900 measured, on the warmed pool. Quantiles use nearest rank; 200 samples offer weak p99 evidence. No open-loop capacity or external-user latency claim.

First rows are route-first responses before warmup, including DNS/TCP/TLS. Only hello is deployment-first; shared functions can already be warm for other routes. Freshness is operator-declared. Confirmed process-cold time, server duration and whole-instance used memory are unavailable unless independently supplied by platform observability; diagnostic process RSS is separate. x-vercel-id identifies request/regions, not cold state. No assumed idle eviction timeout.

- node: https://next-scriptc-frotnpfro-noahs-projects-8a075d15.vercel.app; operator-declared untouched fresh deployment.
- native: https://next-scriptc-nu2tks703-noahs-projects-8a075d15.vercel.app; operator-declared untouched fresh deployment.
  Server: dpl_BV8QT167tRZPZQBcp32S8bi8dZ7n; target=preview; hello runtime=nodejs24.x, region=iad1, allocated memory=2048 MiB (not used memory). Full function mappings are in JSON.
  Server: dpl_CeVoNfNnLX23kXn5qu2Q4qrd2aNS; target=preview; hello runtime=executable, region=iad1, allocated memory=2048 MiB (not used memory). Full function mappings are in JSON.

Project Fluid setting observed at 2026-10-31T10:23:22.031Z: true. This is a control-plane observation, not per-request start evidence.


Every metric cell is value; variant/Node ratio. Lower is better for latency, higher for req/s. Ratios require two validated variants; baseline-only is unavailable. Failed rows invalidate comparisons. Client CPU ≥0.8 cores flags suspected generator saturation; count-limited windows are not sustained capacity.

| Workload | Variant | First ms; ratio ↓ | C=1 p50 ms; ratio ↓ | p95 ms; ratio ↓ | p99 ms; ratio ↓ | C=16 req/s; ratio ↑ | C=16 p50/p95/p99 ms; ratios ↓ | C=16 count / elapsed ms | CPU cores / saturated / capped | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hello | node | 231.998; 1.000× | 23.118; 1.000× | 44.090; 1.000× | 120.338; 1.000× | 588.465; 1.000× | 23.788; 1.000× / 41.365; 1.000× / 85.824; 1.000× | 900 / 1529.402 | 0.218 / false / true | measured |
| verify | node | 85.069; 1.000× | 23.000; 1.000× | 41.966; 1.000× | 78.879; 1.000× | 579.415; 1.000× | 23.419; 1.000× / 41.530; 1.000× / 56.505; 1.000× | 900 / 1553.292 | 0.219 / false / true | measured |
| revenue | node | 98.425; 1.000× | 28.593; 1.000× | 55.171; 1.000× | 102.324; 1.000× | 551.537; 1.000× | 25.656; 1.000× / 41.385; 1.000× / 74.612; 1.000× | 900 / 1631.803 | 0.264 / false / true | measured |
| gzip-export | node | 57.720; 1.000× | 29.453; 1.000× | 48.422; 1.000× | 75.762; 1.000× | 422.092; 1.000× | 32.371; 1.000× / 56.569; 1.000× / 82.909; 1.000× | 900 / 2132.237 | 0.956 / true / true | measured |
| nearby-stores | node | 78.524; 1.000× | 25.666; 1.000× | 43.696; 1.000× | 62.338; 1.000× | 596.189; 1.000× | 24.310; 1.000× / 39.723; 1.000× / 55.503; 1.000× | 900 / 1509.587 | 0.189 / false / true | measured |
| markdown | node | 133.396; 1.000× | 24.329; 1.000× | 42.747; 1.000× | 60.925; 1.000× | 582.253; 1.000× | 23.629; 1.000× / 40.560; 1.000× / 78.319; 1.000× | 900 / 1545.721 | 0.255 / false / true | measured |
| hello | native | 125.542; 0.541× | 21.360; 0.924× | 39.628; 0.899× | 63.782; 0.530× | 632.770; 1.075× | 21.472; 0.903× / 39.587; 0.957× / 103.688; 1.208× | 900 / 1422.318 | 0.170 / false / true | measured |
| verify | native | 96.495; 1.134× | 25.682; 1.117× | 40.239; 0.959× | 60.149; 0.763× | 694.927; 1.199× | 19.636; 0.838× / 35.716; 0.860× / 64.288; 1.138× | 900 / 1295.100 | 0.199 / false / true | measured |
| revenue | native | 34.036; 0.346× | 22.626; 0.791× | 37.062; 0.672× | 58.691; 0.574× | 624.275; 1.132× | 21.580; 0.841× / 40.892; 0.988× / 98.366; 1.318× | 900 / 1441.672 | 0.226 / false / true | measured |
| gzip-export | native | 92.003; 1.594× | 25.433; 0.864× | 40.285; 0.832× | 103.798; 1.370× | 447.821; 1.061× | 29.077; 0.898× / 51.043; 0.902× / 109.099; 1.316× | 900 / 2009.733 | 1.107 / true / true | measured |
| nearby-stores | native | 33.598; 0.428× | 22.016; 0.858× | 43.452; 0.994× | 70.156; 1.125× | 582.272; 0.977× | 22.133; 0.910× / 44.361; 1.117× / 131.531; 2.370× | 900 / 1545.668 | 0.171 / false / true | measured |
| markdown | native | 78.189; 0.586× | 60.620; 2.492× | 78.918; 1.846× | 143.147; 2.350× | 241.455; 0.415× | 61.943; 2.621× / 80.236; 1.978× / 114.022; 1.456× | 743 / 3077.184 | 0.110 / false / false | measured |

Issued requests (includes warmup/first/failures): 24269. Provisioned Sandbox upper bound: 0.084 vCPU-h. Platform active CPU: unavailable ms (not the provisioned upper bound).

Shared-Function diagnostic process RSS is in JSON (memoryAfterFirst / memoryAfterLoad); each response may reach any instance. Native includes its sole executable process, with no Go proxy. Node includes in-process launcher work and excludes only separate platform processes. Whole-instance memory and platform peak remain unavailable. Function limits are not RSS.

Deployment provenance / resource settings are supplied in the sibling metadata JSON when available; equality must be checked before interpreting native/Node differences. Baseline-only evidence cannot establish a native speedup. All losses, failures, count caps and omissions remain visible.
