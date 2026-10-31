| Mode | Runtime | p50 ms | p95 ms | / Go SIMD | / Go plain | / Node |
|---|---|---:|---:|---:|---:|---:|
| int8-i32 | node | 102.198 | 103.470 | 8.594 | 1.742 | 1.000 |
| int8-i32 | patched-baseline | 17.571 | 18.822 | 1.478 | 0.300 | 0.172 |
| int8-i32 | patched-v3 | 9.180 | 11.013 | 0.772 | 0.156 | 0.090 |
| int8-i32 | patched-dispatch | 9.251 | 10.465 | 0.778 | 0.158 | 0.091 |
| int8-i32 | go-plain | 58.661 | 59.286 | 4.933 | 1.000 | 0.574 |
| int8-i32 | go-v3 | 58.479 | 59.350 | 4.918 | 0.997 | 0.572 |
| int8-i32 | go-simd | 11.892 | 15.867 | 1.000 | 0.203 | 0.116 |
| int8-i32 | stock-baseline | 396.536 | 397.957 | 33.346 | 6.760 | 3.880 |
| int8-i32 | stock-v3 | 377.825 | 383.105 | 31.772 | 6.441 | 3.697 |
| int8-i32 | stock-dispatch | 377.894 | 381.330 | 31.778 | 6.442 | 3.698 |
| int8-imul | node | 101.942 | 102.964 | 8.886 | 1.745 | 1.000 |
| int8-imul | stock-baseline | 16.942 | 17.214 | 1.477 | 0.290 | 0.166 |
| int8-imul | stock-v3 | 8.674 | 9.070 | 0.756 | 0.149 | 0.085 |
| int8-imul | stock-dispatch | 8.850 | 9.452 | 0.771 | 0.152 | 0.087 |
| int8-imul | patched-baseline | 17.235 | 18.108 | 1.502 | 0.295 | 0.169 |
| int8-imul | patched-v3 | 9.054 | 9.625 | 0.789 | 0.155 | 0.089 |
| int8-imul | patched-dispatch | 9.351 | 12.250 | 0.815 | 0.160 | 0.092 |
| int8-imul | go-plain | 58.411 | 58.910 | 5.092 | 1.000 | 0.573 |
| int8-imul | go-v3 | 58.464 | 73.243 | 5.096 | 1.001 | 0.574 |
| int8-imul | go-simd | 11.472 | 11.859 | 1.000 | 0.196 | 0.113 |
| float | node | 115.948 | 117.054 | 2.682 | 1.251 | 1.000 |
| float | stock-baseline | 92.388 | 100.995 | 2.137 | 0.997 | 0.797 |
| float | stock-v3 | 91.477 | 92.552 | 2.116 | 0.987 | 0.789 |
| float | stock-dispatch | 91.329 | 91.696 | 2.113 | 0.986 | 0.788 |
| float | patched-baseline | 91.971 | 92.213 | 2.128 | 0.992 | 0.793 |
| float | patched-v3 | 91.456 | 91.857 | 2.116 | 0.987 | 0.789 |
| float | patched-dispatch | 91.225 | 91.691 | 2.110 | 0.984 | 0.787 |
| float | go-plain | 92.672 | 93.141 | 2.144 | 1.000 | 0.799 |
| float | go-v3 | 92.163 | 92.861 | 2.132 | 0.995 | 0.795 |
| float | go-simd | 43.228 | 44.372 | 1.000 | 0.466 | 0.373 |
| binary | node | 7.002 | 8.995 | — | 3.115 | 1.000 |
| binary | stock-baseline | 6.855 | 9.148 | — | 3.049 | 0.979 |
| binary | stock-v3 | 6.516 | 6.713 | — | 2.898 | 0.931 |
| binary | stock-dispatch | 6.968 | 9.219 | — | 3.100 | 0.995 |
| binary | patched-baseline | 6.780 | 6.818 | — | 3.016 | 0.968 |
| binary | patched-v3 | 6.461 | 6.606 | — | 2.874 | 0.923 |
| binary | patched-dispatch | 6.457 | 7.286 | — | 2.872 | 0.922 |
| binary | go-binary | 2.248 | 2.330 | — | 1.000 | 0.321 |
| binary | go-binary-v3 | 2.073 | 2.348 | — | 0.922 | 0.296 |

| Native binary | Stripped bytes | Tiny fresh process p50 ms | p95 ms |
|---|---:|---:|---:|
| stock-baseline | 386640 | 1.115 | 1.413 |
| stock-v3 | 388272 | 0.985 | 1.518 |
| stock-dispatch | 404504 | 1.036 | 1.366 |
| patched-baseline | 387968 | 1.047 | 1.553 |
| patched-v3 | 390240 | 0.990 | 1.304 |
| patched-dispatch | 406584 | 1.009 | 1.532 |
