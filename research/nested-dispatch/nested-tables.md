| Records | Phase | OFF thread CPU ms | Before AUTO ms (overhead) | After AUTO ms (overhead) |
| ---: | --- | ---: | ---: | ---: |
| 600 | training | 0.00692 | 0.09488 (+1271.8%) | 0.00758 (+9.6%) |
| 600 | steady | 0.00696 | 0.00858 (+23.4%) | 0.00729 (+4.8%) |
| 6000 | training | 0.06096 | 0.96837 (+1488.6%) | 0.06179 (+1.4%) |
| 6000 | steady | 0.06208 | 0.01121 (-81.9%) | 0.06283 (+1.2%) |
| 60000 | training | 0.69462 | 10.71058 (+1441.9%) | 0.69629 (+0.2%) |
| 60000 | steady | 0.68354 | 0.03963 (-94.2%) | 0.68683 (+0.5%) |

Thread CPU excludes native owner CPU; inclusive process totals below include drains. Training medians describe a changing dispatcher.

Settled JS microbenchmark before: direct 6.94 ns, dispatch 45.53 ns, difference 38.58 ns/call.
Settled JS microbenchmark after: direct 6.64 ns, dispatch 57.96 ns, difference 51.31 ns/call.

| Records | Version | Outer state | Verified | Decision call | Helper dispatches |
| ---: | --- | --- | ---: | ---: | ---: |
| 600 | before | native | 28 | 560 | 674400 |
| 600 | after | js-final | 26 | 600 | 0 |
| 6000 | before | native | 28 | 560 | 6744000 |
| 6000 | after | js-final | 26 | 611 | 0 |
| 60000 | before | native | 28 | 560 | 67440000 |
| 60000 | after | js-final | 26 | 610 | 0 |

600 records inclusive process CPU totals (training + steady): {'off': 8.066, 'before': 107.905, 'after': 18.04}.

6000 records inclusive process CPU totals (training + steady): {'off': 52.047, 'before': 637.253, 'after': 63.038000000000004}.

60000 records inclusive process CPU totals (training + steady): {'off': 565.022, 'before': 6395.333, 'after': 629.359}.
