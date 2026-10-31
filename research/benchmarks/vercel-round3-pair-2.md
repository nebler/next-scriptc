# Vercel cold diagnostic

Status: complete; 2026-10-31T09:53:00.324Z; source 171843fd7b0d1b7a7ec41c3c158106182d909179; dirty=true.

All observations, deployment mappings, per-request tail timings and Sandbox provenance are retained in the sibling JSON. First-response latency includes DNS/TCP/TLS; confirmed process-cold state is unavailable. Diagnostic RSS is process-only and may reach any instance.

- native: https://next-scriptc-7zqilblu9-noahs-projects-8a075d15.vercel.app; complete; hello first 136.934 ms; warm p50 22.497 ms; excess 114.437 ms.
- node: https://next-scriptc-56lq8sy3w-noahs-projects-8a075d15.vercel.app; complete; hello first 224.609 ms; warm p50 25.419 ms; excess 199.189 ms.

Issued requests: 128; Sandbox provisioned upper bound 0.004 vCPU-h.
