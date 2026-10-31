# Vercel tail diagnostic

Status: complete; 2026-10-31T08:43:46.752Z; source 96fd55068fab0ba2ef930ef03dcf6bd34e4086c4; dirty=true.

All observations, deployment mappings, per-request tail timings and Sandbox provenance are retained in the sibling JSON. First-response latency includes DNS/TCP/TLS; confirmed process-cold state is unavailable. Diagnostic RSS is process-only and may reach any instance.

- native: https://next-scriptc-5rulskckx-noahs-projects-8a075d15.vercel.app; complete; hello first 117.885 ms; warm p50 unavailable ms; excess unavailable ms.
  original: 700 requests / 1746.964 ms; 400.695 req/s; p50/p95/p99 21.996/49.934/577.822 ms; capped=true. Warmup 32 / 379.681 ms.
  longWarmup: 4500 requests / 6070.628 ms; 741.274 req/s; p50/p95/p99 19.003/34.106/54.455 ms; capped=true. Warmup 1500 / 2164.033 ms.

Issued requests: 6800; Sandbox provisioned upper bound 0.008 vCPU-h.
