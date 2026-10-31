# Vercel cold diagnostic

Status: complete; 2026-10-31T09:12:32.220Z; source 3a10a8e8da7e54571de8070893a22c432baedc05; dirty=true.

All observations, deployment mappings, per-request tail timings and Sandbox provenance are retained in the sibling JSON. First-response latency includes DNS/TCP/TLS; confirmed process-cold state is unavailable. Diagnostic RSS is process-only and may reach any instance.

- node: https://next-scriptc-ax913xzp8-noahs-projects-8a075d15.vercel.app; complete; hello first 217.536 ms; warm p50 23.191 ms; excess 194.345 ms.
- native: https://next-scriptc-bm1z7lis1-noahs-projects-8a075d15.vercel.app; complete; hello first 115.976 ms; warm p50 22.437 ms; excess 93.540 ms.

Issued requests: 128; Sandbox provisioned upper bound 0.004 vCPU-h.
