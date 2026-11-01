# Hill log

## 2026-11-01: Phase 1 boundary encodings

Hypothesis: per-type argument encodings remove the outer JSON escaping and parsing passes for JSON-text strings. Implemented checked signature metadata, mixed ABI shims, raw strings and Uint8Array transport, direct scalars, per-object strict JSON, optional stage instrumentation, and a shared Node runtime loader. Kept after correctness tests and host execution. Both Linux targets pass build and link checks. No performance measurement was run. The calibrated stand-in gate remains pending, and any boundary gain needs hosted confirmation. Details are in [boundary-encodings.md](boundary-encodings.md).
