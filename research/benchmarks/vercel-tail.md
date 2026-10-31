# Vercel tail diagnostic

Status: failed; 2026-10-31T08:42:03.889Z; source 96fd55068fab0ba2ef930ef03dcf6bd34e4086c4; dirty=true.

All observations, deployment mappings, per-request tail timings and Sandbox provenance are retained in the sibling JSON. First-response latency includes DNS/TCP/TLS; confirmed process-cold state is unavailable. Diagnostic RSS is process-only and may reach any instance.

- native: https://next-scriptc-5rulskckx-noahs-projects-8a075d15.vercel.app; failed; hello first 81.753 ms; warm p50 unavailable ms; excess unavailable ms.
  Error: HTTP 500; x-vercel-error=absent; request=iad1::n66xb-1793436125672-c12c177be4bb
- node: https://next-scriptc-lsauumxx2-noahs-projects-8a075d15.vercel.app; complete; hello first 40.582 ms; warm p50 unavailable ms; excess unavailable ms.
  original: 700 requests / 1192.725 ms; 586.892 req/s; p50/p95/p99 24.440/42.806/61.092 ms; capped=true. Warmup 32 / 229.437 ms.
  longWarmup: 4500 requests / 7057.403 ms; 637.628 req/s; p50/p95/p99 21.606/40.224/68.894 ms; capped=true. Warmup 1500 / 2454.187 ms.

Issued requests: 6834; Sandbox provisioned upper bound 0.009 vCPU-h.
