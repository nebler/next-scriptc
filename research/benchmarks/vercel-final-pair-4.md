# Vercel cold diagnostic

Status: complete; 2026-10-31T10:22:29.651Z; source 10d23f6d4487cdf213a871cf8491202b9f83a494; dirty=true.

All observations, deployment mappings, per-request tail timings and Sandbox provenance are retained in the sibling JSON. First-response latency includes DNS/TCP/TLS; confirmed process-cold state is unavailable. Diagnostic RSS is process-only and may reach any instance.

- native: https://next-scriptc-280x5gmd3-noahs-projects-8a075d15.vercel.app; complete; hello first 145.941 ms; warm p50 21.675 ms; excess 124.266 ms.
- node: https://next-scriptc-gp94jvw2x-noahs-projects-8a075d15.vercel.app; complete; hello first 270.754 ms; warm p50 25.489 ms; excess 245.265 ms.

Issued requests: 128; Sandbox provisioned upper bound 0.004 vCPU-h.
