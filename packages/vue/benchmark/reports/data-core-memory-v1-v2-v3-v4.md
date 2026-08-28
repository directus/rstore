# Data Core v1/v2/v3/v4 retained-memory evidence snapshot

Generated: 2026-08-28T09:14:43.018Z

## Environment and versions

- CPU: AMD Ryzen 9 9950X 16-Core Processor
- OS: Linux 7.1.8-200.fc44.x86_64 x64
- Node: v23.9.0
- pnpm: 10.20.0
- Frozen legacy SHA-256: 82162b219cd12e711810bec7856c434a0df47614eb8d8c8309380dc4bbae8fb6
- Data Core v1: 30318e8cae55ae623b112865c8ae04c4c6d43242
- Data Core v2: ffdc11cab53301233881c0512ac5139118779ca9
- Data Core v3: 98cc5a7fb6b48f92d3eff4d0b54f23fdd4bf701c
- Data Core v4: a7baec77dea8601c52ba40cddf93d08d27055274
- Candidate diff SHA-256: dbeaab70f0fd07f6affa51843a9328ad50b9425c4eec78383549252cc0c75431

## Summary

- Steady retained heap versus paired legacy: 1/27 clearly lower, 26/27 clearly higher, 0/27 unclear across three runs.
- Repeatable v4 retained-growth signals above empty-control envelope: 25.
- Evidence remains informational. No CI thresholds or stored memory budgets apply.

## Measurement contract

- Every implementation/scenario runs in a separate Node process with `--expose-gc`.
- Every checkpoint uses lowest `heapUsed` reading across five forced collections after one event-loop turn.
- Steady retained heap is expected live state after construction and warmup, relative to module baseline.
- Growth is signed heap change after bounded repeated work. `growth detected` requires all three values to exceed matching empty-control envelope.
- Teardown residual is signed heap remaining after scopes stop, cache disposal, reference release, and forced collection.
- Version ratios first normalize engine retained heap by same-run frozen legacy. Lower ratios use less retained heap.

## Ownership rows

| Scenario | Items | Legacy MiB | v1 MiB | v2 MiB | v3 MiB | v4 MiB | v4/legacy | v4/v3 | v4 growth KiB | Growth signal | v4 teardown KiB |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|
| empty lifecycle control | 1000 | 0.008 | 0.009 | 0.008 | 0.009 | 0.005 | control | control | 0.60 | inconclusive | 11.69 |
| records only | 100 | 0.538 | 0.569 | 0.700 | 0.621 | 0.619 | 1.199× [1.196, 1.200] | 1.041× [1.035, 1.042] | 27.61 | growth detected | 344.71 |
| records only | 1000 | 2.885 | 2.072 | 3.070 | 2.917 | 2.972 | 1.050× [1.049, 1.050] | 1.039× [1.037, 1.040] | 103.58 | growth detected | 382.00 |
| records only | 10000 | 26.397 | 17.581 | 27.243 | 26.197 | 26.808 | 1.033× [1.033, 1.033] | 1.041× [1.041, 1.042] | 879.24 | growth detected | 405.55 |
| materialized wrappers | 100 | 0.631 | 0.658 | 0.782 | 0.813 | 0.896 | 1.452× [1.452, 1.466] | 1.139× [1.134, 1.170] | 52.98 | growth detected | 523.16 |
| materialized wrappers | 1000 | 3.050 | 2.212 | 3.135 | 3.307 | 3.502 | 1.172× [1.168, 1.177] | 1.083× [1.077, 1.090] | 53.85 | growth detected | 572.48 |
| materialized wrappers | 10000 | 27.369 | 18.372 | 27.193 | 28.879 | 30.191 | 1.123× [1.123, 1.123] | 1.064× [1.064, 1.064] | 15.12 | growth detected | 565.03 |
| scalar index reader | 100 | 0.780 | 0.842 | 1.037 | 0.965 | 1.011 | 1.306× [1.304, 1.308] | 1.063× [1.061, 1.065] | 24.10 | growth detected | 631.34 |
| scalar index reader | 1000 | 3.135 | 2.326 | 3.571 | 3.445 | 3.564 | 1.151× [1.151, 1.151] | 1.049× [1.047, 1.050] | 20.50 | growth detected | 658.98 |
| scalar index reader | 10000 | 26.722 | 17.739 | 29.625 | 28.590 | 29.280 | 1.115× [1.114, 1.115] | 1.042× [1.041, 1.043] | 30.40 | growth detected | 662.02 |
| composite index reader | 100 | 0.790 | 0.858 | 1.071 | 0.998 | 1.044 | 1.333× [1.332, 1.333] | 1.060× [1.059, 1.064] | 19.55 | growth detected | 649.47 |
| composite index reader | 1000 | 3.219 | 2.399 | 3.640 | 3.505 | 3.632 | 1.143× [1.143, 1.145] | 1.050× [1.049, 1.053] | 16.56 | growth detected | 673.77 |
| composite index reader | 10000 | 27.557 | 18.227 | 30.101 | 29.066 | 29.762 | 1.098× [1.098, 1.098] | 1.041× [1.041, 1.042] | 29.94 | growth detected | 679.32 |
| relation reader | 100 | 0.835 | 0.922 | 1.086 | 1.025 | 1.068 | 1.295× [1.295, 1.296] | 1.059× [1.058, 1.060] | 35.69 | growth detected | 667.91 |
| relation reader | 1000 | 3.248 | 2.391 | 3.612 | 3.472 | 3.598 | 1.121× [1.121, 1.122] | 1.051× [1.051, 1.052] | 27.74 | growth detected | 687.66 |
| relation reader | 10000 | 27.046 | 17.808 | 29.653 | 28.647 | 29.334 | 1.085× [1.085, 1.086] | 1.041× [0.969, 1.042] | 43.90 | growth detected | 689.45 |
| five optimistic layers | 100 | 0.620 | 0.737 | 0.886 | 0.899 | 0.936 | 1.509× [1.508, 1.510] | 1.040× [1.038, 1.044] | 14.63 | growth detected | 548.03 |
| five optimistic layers | 1000 | 3.023 | 2.412 | 3.387 | 3.324 | 3.414 | 1.148× [1.147, 1.149] | 1.045× [1.043, 1.046] | 39.48 | growth detected | 587.88 |
| five optimistic layers | 10000 | 26.930 | 19.319 | 28.955 | 28.008 | 28.678 | 1.083× [1.083, 1.084] | 1.042× [1.041, 1.043] | -947.44 | inconclusive | 3833.45 |
| delete/reinsert tombstones | 100 | 0.568 | 0.605 | 0.740 | 0.656 | 0.666 | 1.190× [1.189, 1.190] | 1.032× [1.029, 1.033] | 178.21 | growth detected | 475.25 |
| delete/reinsert tombstones | 1000 | 2.925 | 2.165 | 3.160 | 3.006 | 3.083 | 1.071× [1.070, 1.071] | 1.043× [1.042, 1.043] | 166.30 | growth detected | 496.84 |
| delete/reinsert tombstones | 10000 | 26.716 | 17.872 | 27.510 | 26.475 | 27.099 | 1.032× [1.032, 1.032] | 1.041× [1.041, 1.041] | 119.70 | growth detected | 515.30 |
| exact-item watchers | 1000 | 3.175 | 2.277 | 3.215 | 3.098 | 3.154 | 1.011× [1.011, 1.013] | 1.037× [1.036, 1.040] | 92.31 | growth detected | 551.42 |
| full-list watchers | 1000 | 5.961 | 2.163 | 3.165 | 3.054 | 3.171 | 0.500× [0.499, 0.500] | 0.810× [0.733, 1.046] | 23.25 | growth detected | 522.27 |
| hydrate with retained wrapper | 1000 | 2.923 | 2.143 | 3.195 | 3.030 | 3.094 | 1.076× [1.075, 1.076] | 1.040× [1.037, 1.043] | 65.41 | growth detected | 559.38 |
| exact-index result churn | 4096 | 10.974 | 7.191 | 12.186 | 11.821 | 12.146 | 1.125× [1.124, 1.126] | 1.044× [1.044, 1.048] | 27.10 | growth detected | 441.65 |
| orphan signal churn | 1024 | 0.230 | 0.316 | 0.243 | 0.510 | 0.563 | 2.493× [2.485, 2.497] | 1.124× [1.116, 1.130] | -61.41 | inconclusive | 245.94 |
| wrapper lifecycle churn | 1000 | 2.976 | 2.241 | 3.230 | 3.437 | 3.533 | 1.206× [1.206, 1.208] | 1.045× [1.044, 1.047] | 161.16 | growth detected | 609.00 |

## Retained-growth signals

- records-only (100 items): 27.61 KiB median over 10000 writes; range 27.23–29.08 KiB.
- records-only (1000 items): 103.58 KiB median over 10000 writes; range 100.98–104.49 KiB.
- records-only (10000 items): 879.24 KiB median over 10000 writes; range 870.89–893.02 KiB.
- materialized-wrappers (100 items): 52.98 KiB median over 10000 writes; range 35.32–54.13 KiB.
- materialized-wrappers (1000 items): 53.85 KiB median over 10000 writes; range 33.10–61.11 KiB.
- materialized-wrappers (10000 items): 15.12 KiB median over 10000 writes; range 15.10–15.27 KiB.
- scalar-index-reader (100 items): 24.10 KiB median over 1000 membership changes; range 23.80–24.51 KiB.
- scalar-index-reader (1000 items): 20.50 KiB median over 1000 membership changes; range 12.13–20.68 KiB.
- scalar-index-reader (10000 items): 30.40 KiB median over 1000 membership changes; range 30.30–30.87 KiB.
- composite-index-reader (100 items): 19.55 KiB median over 1000 membership changes; range 19.05–19.65 KiB.
- composite-index-reader (1000 items): 16.56 KiB median over 1000 membership changes; range 15.25–16.56 KiB.
- composite-index-reader (10000 items): 29.94 KiB median over 1000 membership changes; range 29.94–30.50 KiB.
- relation-reader (100 items): 35.69 KiB median over 1000 membership changes; range 35.69–35.69 KiB.
- relation-reader (1000 items): 27.74 KiB median over 1000 membership changes; range 27.74–28.34 KiB.
- relation-reader (10000 items): 43.90 KiB median over 1000 membership changes; range 43.31–44.32 KiB.
- optimistic-layers (100 items): 14.63 KiB median over 1000 layer cycles; range 10.96–14.63 KiB.
- optimistic-layers (1000 items): 39.48 KiB median over 1000 layer cycles; range 39.48–39.48 KiB.
- tombstones (100 items): 178.21 KiB median over 2000 mutations; range 177.91–178.59 KiB.
- tombstones (1000 items): 166.30 KiB median over 2000 mutations; range 165.58–166.31 KiB.
- tombstones (10000 items): 119.70 KiB median over 2000 mutations; range 115.71–121.34 KiB.
- item-watchers (1000 items): 92.31 KiB median over 10000 writes; range 85.72–92.31 KiB.
- list-watchers (1000 items): 23.25 KiB median over 128 writes; range 23.25–24.48 KiB.
- hydrate-retained-wrapper (1000 items): 65.41 KiB median over 128 hydrations; range 65.23–66.62 KiB.
- index-result-churn (4096 items): 27.10 KiB median over 512 queries; range 26.38–32.66 KiB.
- wrapper-lifecycle-churn (1000 items): 161.16 KiB median over 2000 lifecycles; range 159.24–161.39 KiB.

## Post-disposal residuals

- Residual values include runtime/JIT noise still present after scenario references are released; interpret only with three-run ranges and empty control.
- empty-control (1000): v4 median 11.69 KiB; range 11.34–11.69 KiB.
- records-only (100): v4 median 344.71 KiB; range 344.05–344.71 KiB.
- records-only (1000): v4 median 382.00 KiB; range 381.84–382.95 KiB.
- records-only (10000): v4 median 405.55 KiB; range 391.08–406.25 KiB.
- materialized-wrappers (100): v4 median 523.16 KiB; range 522.80–523.73 KiB.
- materialized-wrappers (1000): v4 median 572.48 KiB; range 564.97–572.94 KiB.
- materialized-wrappers (10000): v4 median 565.03 KiB; range 563.75–566.55 KiB.
- scalar-index-reader (100): v4 median 631.34 KiB; range 630.78–632.45 KiB.
- scalar-index-reader (1000): v4 median 658.98 KiB; range 657.45–659.40 KiB.
- scalar-index-reader (10000): v4 median 662.02 KiB; range 661.36–663.16 KiB.
- composite-index-reader (100): v4 median 649.47 KiB; range 649.10–650.61 KiB.
- composite-index-reader (1000): v4 median 673.77 KiB; range 673.50–674.24 KiB.
- composite-index-reader (10000): v4 median 679.32 KiB; range 679.02–679.62 KiB.
- relation-reader (100): v4 median 667.91 KiB; range 667.31–669.34 KiB.
- relation-reader (1000): v4 median 687.66 KiB; range 687.28–688.02 KiB.
- relation-reader (10000): v4 median 689.45 KiB; range 685.70–690.06 KiB.
- optimistic-layers (100): v4 median 548.03 KiB; range 547.91–548.03 KiB.
- optimistic-layers (1000): v4 median 587.88 KiB; range 587.86–588.26 KiB.
- optimistic-layers (10000): v4 median 3833.45 KiB; range -864.66–3836.46 KiB.
- tombstones (100): v4 median 475.25 KiB; range 474.02–475.29 KiB.
- tombstones (1000): v4 median 496.84 KiB; range 496.58–496.95 KiB.
- tombstones (10000): v4 median 515.30 KiB; range 514.30–515.60 KiB.
- item-watchers (1000): v4 median 551.42 KiB; range 551.20–551.79 KiB.
- list-watchers (1000): v4 median 522.27 KiB; range 520.77–522.85 KiB.
- hydrate-retained-wrapper (1000): v4 median 559.38 KiB; range 558.86–559.73 KiB.
- index-result-churn (4096): v4 median 441.65 KiB; range 441.39–441.65 KiB.
- orphan-signal-churn (1024): v4 median 245.94 KiB; range 245.94–246.05 KiB.
- wrapper-lifecycle-churn (1000): v4 median 609.00 KiB; range 608.54–609.73 KiB.

Companion JSON retains raw checkpoints, signed deltas, all runs, envelopes, and exact workload dimensions.
