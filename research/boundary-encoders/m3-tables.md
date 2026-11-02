
new revenue:

| Events | JS CPU median / p95 | Fixed native CPU median / p95 | AUTO CPU median / p95 | Lane | AUTO / best |
| ---: | ---: | ---: | ---: | --- | ---: |
| 1000 | 0.460 / 0.486 | 0.731 / 0.982 | 0.464 / 0.525 | js-final | 1.009 |
| 5000 | 2.190 / 2.341 | 1.443 / 1.637 | 1.346 / 1.560 | native | 0.933 |
| 15000 | 6.349 / 6.560 | 2.824 / 3.145 | 2.782 / 3.234 | native | 0.985 |
| 200000 | 100.057 / 103.703 | 29.407 / 30.176 | 29.805 / 36.485 | native | 1.014 |

Mixed inclusive process CPU totals: {'js': 5829.921, 'native-new': 2338.858, 'auto-new': 2695.269}.
C1 proxy totals: {'js': 10447.421076, 'native-new': 4481.592144398992, 'auto-new': 5227.332548295215}.
Amended gate: within calibration noise per bucket True; mixed AUTO upper band < JS lower band True.

construction revenue:

| Events | JS CPU median / p95 | Fixed native CPU median / p95 | AUTO CPU median / p95 | Lane | AUTO / best |
| ---: | ---: | ---: | ---: | --- | ---: |
| 1000 | 0.460 / 0.486 | 0.270 / 0.295 | 0.270 / 0.301 | native | 1.000 |
| 5000 | 2.190 / 2.341 | 0.882 / 1.024 | 0.867 / 1.023 | native | 0.983 |
| 15000 | 6.349 / 6.560 | 2.289 / 2.508 | 2.266 / 2.553 | native | 0.990 |
| 200000 | 100.057 / 103.703 | 28.825 / 30.397 | 28.981 / 29.743 | native | 1.005 |

Mixed inclusive process CPU totals: {'js': 5829.921, 'native-construction': 1962.041, 'auto-construction': 1957.86}.
C1 proxy totals: {'js': 10447.421076, 'native-construction': 3639.422941790219, 'auto-construction': 3633.7792862270753}.
Amended gate: within calibration noise per bucket True; mixed AUTO upper band < JS lower band True.
