# CPU-heavy scouting: where can native TypeScript beat both Node and Go?

2026-10-31. Four parallel scouts, each a kernel-only fast loop (no Next.js, no HTTP). The same TypeScript runs on Node and through scriptc 0.4.6 (release), against idiomatic Go. Outputs are identical across variants. Each result was confirmed on Linux in a Vercel Sandbox. Details are in the per-candidate reports.

| Candidate | Linux: native vs Node | Linux: native vs Go | Compiler work needed | Report |
|---|---|---|---|---|
| Dashboard aggregation (200k events from a JSON export) | 31 vs 117 ms (**3.7×**) | vs 129–182 ms (**4.1–5.8×**) | none | [scout-dashboard.md](scout-dashboard.md) |
| int8 vector search (100k × 768, top-10), `Math.imul` idiom | 24 vs 133 ms (**5.5×**) | vs 61 ms (**2.6×**) | none for the idiom; **natural `a[i] * b[i]` code is ~16× slower than Go** (396 ms) | [scout-vectors.md](scout-vectors.md) |
| BlurHash encode (2048²) | 136 vs 223 ms (1.6×) | tie with the best Go port (136 ms) | guarded range analysis, about 1–3 weeks | [scout-blurhash.md](scout-blurhash.md) |
| Image resize (box/bilinear) | about level | **1.3–1.8× slower** | integer regions and bounds hoisting, about 1–3 weeks | [scout-resize.md](scout-resize.md) |

## Takeaways

- **Dashboard aggregation already wins without compiler work.** scriptc's typed JSON parsing (17 ms) beats Go's `encoding/json` (142 ms) and V8 (59 ms). Go's grouping step is faster than native (6.7 vs 10.4 ms). Before claiming "faster than Go", it still has to be measured against the faster Go JSON libraries (`bytedance/sonic`, `goccy/go-json`, `jsoniter`).
- **int8 vector search is the compiler hill-climb target.** With `(sum + Math.imul(a, b)) | 0`, LLVM vectorizes the integer reduction and Go's compiler keeps the loop scalar. The natural form `(sum + a[i] * b[i]) | 0` keeps floating-point arithmetic plus a full ToInt32 coercion. That is a range-analysis gap in the scriptc frontend, an estimated 2–5 engineer-days with signed-zero/NaN care. Fixing it generally would make natural TypeScript beat Go here.
- **Losses kept:**
  - Go wins image resizing.
  - Go's popcount intrinsic wins binary-embedding search (3.4×).
  - Plain float vector search only ties Go on Linux.
  - BlurHash ties the best Go port.
- Mac numbers (M4 Pro) are indicative only. Linux numbers come from single Sandbox VMs and are not production Vercel numbers.

## Next

1. **Hill-climb:** fix the int8 range analysis on a scriptc fork. The full scriptc test suite must stay green. Then measure natural code against Node, plain Go and a labelled Go SIMD-library variant.
2. Dashboard fairness pass (fast Go JSON libraries), then an end-to-end three-way route on Vercel.
