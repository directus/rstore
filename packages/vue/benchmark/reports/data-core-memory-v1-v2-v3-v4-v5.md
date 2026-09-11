# Data Core v1/v2/v3/v4/v5 retained-memory evidence snapshot

Generated: 2026-08-28T14:13:29.125Z

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
- Data Core v5: working tree based on a7baec77dea8601c52ba40cddf93d08d27055274
- Candidate diff SHA-256: 5207f9d917229f2928bd4a8ffdbd2f492b715f7632a8dcbd75ea24f5d4dfd461

## Summary

- Steady retained heap versus paired legacy: 13/27 clearly lower, 14/27 clearly higher, 0/27 unclear across three runs.
- Repeatable v5 retained-growth signals above empty-control envelope: 23.
- Practical steady-memory parity: 13 meet target, 1 near parity, 13 miss target.
- Evidence remains informational. No CI thresholds or stored memory budgets apply.

## Measurement contract

- Every implementation/scenario runs in a separate Node process with `--expose-gc`.
- Every checkpoint uses lowest `heapUsed` reading across five forced collections after one event-loop turn.
- Steady retained heap is expected live state after construction and warmup, relative to module baseline.
- Growth is signed heap change after bounded repeated work. `growth detected` requires all three values to exceed matching empty-control envelope.
- Teardown residual is signed heap remaining after scopes stop, cache disposal, reference release, and forced collection.
- Version ratios first normalize engine retained heap by same-run frozen legacy. Lower ratios use less retained heap.

## Ownership rows

| Scenario | Items | Legacy MiB | v1 MiB | v2 MiB | v3 MiB | v4 MiB | v5 MiB | v5/legacy | v5/v4 | Memory target | v5 growth KiB | Growth signal | v5 teardown KiB |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---|---:|
| empty lifecycle control | 1000 | 0.008 | 0.009 | -0.184 | 0.009 | 0.006 | 0.006 | control | control | control | 0.60 | inconclusive | 11.34 |
| records only | 100 | 0.260 | 0.392 | 0.227 | 0.351 | 0.334 | 0.327 | 1.261× [1.260, 1.270] | 0.980× [0.963, 0.990] | misses target | 6.19 | growth detected | 270.27 |
| records only | 1000 | 0.488 | 0.553 | 0.395 | 0.518 | 0.501 | 0.471 | 0.966× [0.961, 0.968] | 0.940× [0.927, 0.944] | meets target | 3.47 | growth detected | 273.10 |
| records only | 10000 | 2.711 | 2.748 | 2.787 | 2.715 | 2.698 | 2.259 | 0.838× [0.838, 0.840] | 0.837× [0.836, 0.840] | meets target | 15.38 | growth detected | 294.78 |
| materialized wrappers | 100 | 0.583 | 0.656 | 0.588 | 0.804 | 0.895 | 0.792 | 1.361× [1.360, 1.365] | 0.935× [0.934, 0.941] | misses target | 44.84 | growth detected | 541.54 |
| materialized wrappers | 1000 | 2.998 | 2.213 | 2.942 | 3.307 | 3.498 | 2.520 | 0.954× [0.950, 0.954] | 0.818× [0.814, 0.819] | meets target | 49.82 | growth detected | 602.41 |
| materialized wrappers | 10000 | 26.898 | 18.373 | 27.000 | 28.870 | 30.191 | 19.860 | 0.850× [0.849, 0.850] | 0.757× [0.756, 0.757] | meets target | 20.15 | growth detected | 618.25 |
| scalar index reader | 100 | 0.577 | 0.717 | 0.636 | 0.766 | 0.808 | 0.785 | 1.379× [1.379, 1.379] | 0.986× [0.983, 0.990] | misses target | 9.28 | growth detected | 626.00 |
| scalar index reader | 1000 | 0.987 | 1.002 | 1.207 | 1.333 | 1.393 | 1.080 | 1.097× [1.095, 1.102] | 0.802× [0.797, 0.808] | misses target | 8.80 | growth detected | 646.55 |
| scalar index reader | 10000 | 5.230 | 4.414 | 7.450 | 7.515 | 7.652 | 4.072 | 0.808× [0.806, 0.808] | 0.568× [0.566, 0.571] | meets target | 22.90 | growth detected | 696.48 |
| composite index reader | 100 | 0.586 | 0.734 | 0.670 | 0.799 | 0.839 | 0.814 | 1.404× [1.403, 1.407] | 0.982× [0.980, 0.988] | misses target | 6.63 | growth detected | 642.88 |
| composite index reader | 1000 | 1.066 | 1.077 | 1.276 | 1.395 | 1.461 | 1.143 | 1.072× [1.071, 1.072] | 0.809× [0.808, 0.809] | misses target | 6.76 | growth detected | 660.43 |
| composite index reader | 10000 | 6.087 | 4.903 | 7.949 | 7.991 | 8.135 | 4.553 | 0.775× [0.775, 0.775] | 0.593× [0.592, 0.594] | meets target | 21.13 | growth detected | 716.36 |
| relation reader | 100 | 0.713 | 0.844 | 0.781 | 0.915 | 0.956 | 0.895 | 1.271× [1.270, 1.272] | 0.960× [0.958, 0.961] | misses target | 27.70 | growth detected | 678.46 |
| relation reader | 1000 | 1.901 | 1.651 | 2.212 | 2.305 | 2.396 | 1.695 | 0.897× [0.897, 0.897] | 0.773× [0.773, 0.774] | meets target | 16.75 | growth detected | 690.34 |
| relation reader | 10000 | 13.793 | 10.316 | 17.179 | 16.839 | 17.271 | 9.768 | 0.710× [0.710, 0.711] | 0.638× [0.638, 0.639] | meets target | 17.04 | growth detected | 718.43 |
| five optimistic layers | 100 | 0.413 | 0.602 | 0.652 | 0.671 | 0.692 | 0.724 | 1.749× [1.748, 1.749] | 1.045× [1.044, 1.046] | misses target | -37.24 | inconclusive | 559.06 |
| five optimistic layers | 1000 | 0.742 | 0.924 | 0.762 | 0.970 | 1.000 | 0.994 | 1.345× [1.336, 1.347] | 0.998× [0.986, 1.000] | misses target | -34.64 | inconclusive | 597.16 |
| five optimistic layers | 10000 | 3.637 | 4.130 | 4.161 | 4.187 | 4.240 | 3.773 | 1.037× [1.037, 1.038] | 0.889× [0.889, 0.890] | near parity | -1997.27 | inconclusive | -1393.47 |
| delete/reinsert tombstones | 100 | 0.330 | 0.467 | 0.316 | 0.429 | 0.427 | 0.429 | 1.307× [1.305, 1.309] | 1.011× [0.998, 1.014] | misses target | 5.01 | growth detected | 334.55 |
| delete/reinsert tombstones | 1000 | 0.596 | 0.748 | 0.595 | 0.716 | 0.713 | 0.683 | 1.145× [1.144, 1.146] | 0.957× [0.955, 0.959] | misses target | 61.11 | growth detected | 317.39 |
| delete/reinsert tombstones | 10000 | 3.073 | 3.137 | 2.982 | 3.109 | 3.101 | 2.690 | 0.875× [0.870, 0.875] | 0.867× [0.863, 0.868] | meets target | 57.70 | growth detected | 320.31 |
| exact-item watchers | 1000 | 0.868 | 0.810 | 0.611 | 0.772 | 0.764 | 0.724 | 0.837× [0.831, 0.841] | 0.952× [0.937, 0.959] | meets target | 32.30 | growth detected | 506.60 |
| full-list watchers | 1000 | 5.992 | 2.176 | 2.980 | 3.065 | 3.179 | 2.177 | 0.363× [0.363, 0.363] | 0.725× [0.724, 0.725] | meets target | 28.29 | growth detected | 541.75 |
| hydrate with retained wrapper | 1000 | 0.545 | 0.657 | 0.558 | 0.660 | 0.647 | 0.625 | 1.167× [1.152, 1.167] | 0.973× [0.952, 0.980] | misses target | 60.12 | growth detected | 484.64 |
| exact-index result churn | 4096 | 10.814 | 7.117 | 11.916 | 11.745 | 12.088 | 7.170 | 0.765× [0.765, 0.766] | 0.684× [0.684, 0.685] | meets target | 37.32 | growth detected | 468.01 |
| orphan signal churn | 1024 | 0.229 | 0.313 | 0.051 | 0.508 | 0.564 | 0.379 | 1.656× [1.656, 1.657] | 0.669× [0.668, 0.670] | misses target | -52.09 | inconclusive | 230.60 |
| wrapper lifecycle churn | 1000 | 2.777 | 2.216 | 3.009 | 3.408 | 3.513 | 2.544 | 0.992× [0.992, 0.992] | 0.823× [0.823, 0.823] | meets target | 25.20 | growth detected | 560.60 |

## Retained-growth signals

- records-only (100 items): 6.19 KiB median over 10000 writes; range 2.79–6.24 KiB.
- records-only (1000 items): 3.47 KiB median over 10000 writes; range 3.02–4.02 KiB.
- records-only (10000 items): 15.38 KiB median over 10000 writes; range 1.65–17.21 KiB.
- materialized-wrappers (100 items): 44.84 KiB median over 10000 writes; range 43.92–45.86 KiB.
- materialized-wrappers (1000 items): 49.82 KiB median over 10000 writes; range 44.28–62.97 KiB.
- materialized-wrappers (10000 items): 20.15 KiB median over 10000 writes; range 20.15–24.45 KiB.
- scalar-index-reader (100 items): 9.28 KiB median over 1000 membership changes; range 8.72–10.09 KiB.
- scalar-index-reader (1000 items): 8.80 KiB median over 1000 membership changes; range 8.80–8.80 KiB.
- scalar-index-reader (10000 items): 22.90 KiB median over 1000 membership changes; range 10.30–22.90 KiB.
- composite-index-reader (100 items): 6.63 KiB median over 1000 membership changes; range 6.63–6.77 KiB.
- composite-index-reader (1000 items): 6.76 KiB median over 1000 membership changes; range 6.76–7.43 KiB.
- composite-index-reader (10000 items): 21.13 KiB median over 1000 membership changes; range 20.92–21.30 KiB.
- relation-reader (100 items): 27.70 KiB median over 1000 membership changes; range 27.70–27.89 KiB.
- relation-reader (1000 items): 16.75 KiB median over 1000 membership changes; range 16.75–16.75 KiB.
- relation-reader (10000 items): 17.04 KiB median over 1000 membership changes; range 16.93–17.04 KiB.
- tombstones (100 items): 5.01 KiB median over 2000 mutations; range 5.01–5.73 KiB.
- tombstones (1000 items): 61.11 KiB median over 2000 mutations; range 60.94–61.11 KiB.
- tombstones (10000 items): 57.70 KiB median over 2000 mutations; range 57.54–58.20 KiB.
- item-watchers (1000 items): 32.30 KiB median over 10000 writes; range 31.63–45.04 KiB.
- list-watchers (1000 items): 28.29 KiB median over 128 writes; range 28.29–28.94 KiB.
- hydrate-retained-wrapper (1000 items): 60.12 KiB median over 128 hydrations; range 60.09–60.24 KiB.
- index-result-churn (4096 items): 37.32 KiB median over 512 queries; range 31.23–37.37 KiB.
- wrapper-lifecycle-churn (1000 items): 25.20 KiB median over 2000 lifecycles; range 21.65–25.40 KiB.

## Post-disposal residuals

- Residual values include runtime/JIT noise still present after scenario references are released; interpret only with three-run ranges and empty control.
- empty-control (1000): v5 median 11.34 KiB; range 11.34–12.02 KiB.
- records-only (100): v5 median 270.27 KiB; range 269.63–270.61 KiB.
- records-only (1000): v5 median 273.10 KiB; range 272.21–281.08 KiB.
- records-only (10000): v5 median 294.78 KiB; range 294.14–298.01 KiB.
- materialized-wrappers (100): v5 median 541.54 KiB; range 540.04–542.16 KiB.
- materialized-wrappers (1000): v5 median 602.41 KiB; range 602.02–603.17 KiB.
- materialized-wrappers (10000): v5 median 618.25 KiB; range 597.34–621.01 KiB.
- scalar-index-reader (100): v5 median 626.00 KiB; range 625.79–626.05 KiB.
- scalar-index-reader (1000): v5 median 646.55 KiB; range 646.18–646.80 KiB.
- scalar-index-reader (10000): v5 median 696.48 KiB; range 692.13–698.45 KiB.
- composite-index-reader (100): v5 median 642.88 KiB; range 642.79–642.95 KiB.
- composite-index-reader (1000): v5 median 660.43 KiB; range 660.04–661.16 KiB.
- composite-index-reader (10000): v5 median 716.36 KiB; range 716.33–718.40 KiB.
- relation-reader (100): v5 median 678.46 KiB; range 678.43–679.38 KiB.
- relation-reader (1000): v5 median 690.34 KiB; range 689.97–690.80 KiB.
- relation-reader (10000): v5 median 718.43 KiB; range 717.85–720.72 KiB.
- optimistic-layers (100): v5 median 559.06 KiB; range 558.68–559.06 KiB.
- optimistic-layers (1000): v5 median 597.16 KiB; range 596.77–597.96 KiB.
- optimistic-layers (10000): v5 median -1393.47 KiB; range -1395.62–-1393.41 KiB.
- tombstones (100): v5 median 334.55 KiB; range 333.94–334.80 KiB.
- tombstones (1000): v5 median 317.39 KiB; range 317.02–317.52 KiB.
- tombstones (10000): v5 median 320.31 KiB; range 320.20–320.63 KiB.
- item-watchers (1000): v5 median 506.60 KiB; range 506.58–508.20 KiB.
- list-watchers (1000): v5 median 541.75 KiB; range 540.96–542.48 KiB.
- hydrate-retained-wrapper (1000): v5 median 484.64 KiB; range 484.64–485.02 KiB.
- index-result-churn (4096): v5 median 468.01 KiB; range 467.39–468.37 KiB.
- orphan-signal-churn (1024): v5 median 230.60 KiB; range 230.59–230.88 KiB.
- wrapper-lifecycle-churn (1000): v5 median 560.60 KiB; range 560.02–560.92 KiB.

Companion JSON retains raw checkpoints, signed deltas, all runs, envelopes, and exact workload dimensions.
