
new revenue:

| Events | JS CPU median / p95 | Fixed native CPU median / p95 | AUTO CPU median / p95 | Lane | AUTO / best |
| ---: | ---: | ---: | ---: | --- | ---: |
| 1000 | 0.463 / 0.524 | 0.746 / 0.849 | 0.439 / 0.479 | js-final | 0.948 |
| 5000 | 2.130 / 2.174 | 1.309 / 1.434 | 1.293 / 1.515 | native | 0.988 |
| 15000 | 6.283 / 6.443 | 2.788 / 2.971 | 2.735 / 2.984 | native | 0.981 |
| 200000 | 95.683 / 103.423 | 29.489 / 30.045 | 29.923 / 36.550 | native | 1.015 |

Mixed inclusive process CPU totals: {'js': 5732.199, 'native-new': 2423.088, 'auto-new': 2867.187}.
C1 proxy totals: {'js': 10272.430548, 'native-new': 4660.55722244748, 'auto-new': 5575.756493118992}.
Amended gate: within calibration noise per bucket True; mixed AUTO upper band < JS lower band True.

construction revenue:

| Events | JS CPU median / p95 | Fixed native CPU median / p95 | AUTO CPU median / p95 | Lane | AUTO / best |
| ---: | ---: | ---: | ---: | --- | ---: |
| 1000 | 0.463 / 0.524 | 0.266 / 0.312 | 0.266 / 0.347 | native | 1.000 |
| 5000 | 2.130 / 2.174 | 0.826 / 0.916 | 0.822 / 0.915 | native | 0.995 |
| 15000 | 6.283 / 6.443 | 2.269 / 2.496 | 2.272 / 2.494 | native | 1.001 |
| 200000 | 95.683 / 103.423 | 29.023 / 32.784 | 29.151 / 32.052 | native | 1.004 |

Mixed inclusive process CPU totals: {'js': 5732.199, 'native-construction': 1997.339, 'auto-construction': 2137.496}.
C1 proxy totals: {'js': 10272.430548, 'native-construction': 3704.8258151766813, 'auto-construction': 3997.9394377077274}.
Amended gate: within calibration noise per bucket True; mixed AUTO upper band < JS lower band True.
