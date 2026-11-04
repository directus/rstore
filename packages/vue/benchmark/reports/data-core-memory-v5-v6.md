# Data Core v5/v6 retained-memory evidence snapshot

Generated: 2026-08-28T19:40:43.677Z

- Node: v23.9.0
- OS: Linux 7.1.8-200.fc44.x86_64 x64
- CPU: AMD Ryzen 9 9950X 16-Core Processor
- Data Core v5: 94768489abd6d53b883957b3f1b6ce22d66cffc3
- Data Core v6: working tree based on 94768489abd6d53b883957b3f1b6ce22d66cffc3
- Candidate diff SHA-256: a82738477dd0beee918652d2fba62f5e27238ab206fbaf63c1b28738c079f9d4
- Frozen legacy SHA-256: 82162b219cd12e711810bec7856c434a0df47614eb8d8c8309380dc4bbae8fb6

## Summary

- Setup guard: 28/28 rows meet target.
- Steady guard: 28/28 rows meet target.
- New repeatable retained-growth signals: none.
- Evidence remains informational; no CI memory gate applies.

| Scenario | Items | v5 setup MiB | v6 setup MiB | Setup result | v5 steady MiB | v6 steady MiB | Steady result | v6 growth KiB | Growth signal | v6 teardown KiB |
|---|---:|---:|---:|---|---:|---:|---|---:|---|---:|
| empty lifecycle control | 1000 | 0.002 | 0.003 | meets target | 0.005 | 0.006 | meets target | 0.60 | inconclusive | 12.61 |
| records only | 100 | 0.204 | 0.178 | meets target | 0.329 | 0.324 | meets target | 5.83 | growth detected | 270.47 |
| records only | 1000 | 0.385 | 0.313 | meets target | 0.471 | 0.448 | meets target | 3.74 | growth detected | 279.95 |
| records only | 10000 | 2.176 | 1.695 | meets target | 2.258 | 1.831 | meets target | 15.18 | growth detected | 302.56 |
| materialized wrappers | 100 | 0.450 | 0.329 | meets target | 0.794 | 0.696 | meets target | 51.94 | growth detected | 550.38 |
| materialized wrappers | 1000 | 2.222 | 1.234 | meets target | 2.499 | 1.586 | meets target | 32.73 | growth detected | 609.61 |
| materialized wrappers | 10000 | 19.639 | 10.007 | meets target | 19.862 | 10.277 | meets target | 35.40 | growth detected | 659.98 |
| scalar index reader | 100 | 0.319 | 0.293 | meets target | 0.785 | 0.767 | meets target | 10.48 | growth detected | 622.27 |
| scalar index reader | 1000 | 0.656 | 0.515 | meets target | 1.080 | 0.935 | meets target | 10.56 | growth detected | 624.68 |
| scalar index reader | 10000 | 3.638 | 2.261 | meets target | 4.073 | 2.711 | meets target | 38.51 | growth detected | 704.52 |
| composite index reader | 100 | 0.330 | 0.307 | meets target | 0.814 | 0.800 | meets target | 6.03 | growth detected | 641.05 |
| composite index reader | 1000 | 0.713 | 0.571 | meets target | 1.141 | 1.007 | meets target | 6.75 | growth detected | 641.69 |
| composite index reader | 10000 | 4.106 | 2.732 | meets target | 4.556 | 3.194 | meets target | 37.21 | growth detected | 722.71 |
| relation reader | 100 | 0.403 | 0.340 | meets target | 0.897 | 0.843 | meets target | 29.41 | growth detected | 679.96 |
| relation reader | 1000 | 1.230 | 0.724 | meets target | 1.694 | 1.182 | meets target | 19.81 | growth detected | 675.66 |
| relation reader | 10000 | 9.358 | 4.372 | meets target | 9.766 | 4.748 | meets target | 31.97 | growth detected | 738.42 |
| five optimistic layers | 100 | 0.270 | 0.253 | meets target | 0.724 | 0.715 | meets target | -33.88 | inconclusive | 551.05 |
| five optimistic layers | 1000 | 0.573 | 0.536 | meets target | 0.994 | 0.973 | meets target | -33.65 | inconclusive | 582.27 |
| five optimistic layers | 10000 | 3.364 | 3.217 | meets target | 3.772 | 3.641 | meets target | -2008.58 | inconclusive | -1428.82 |
| delete/reinsert tombstones | 100 | 0.208 | 0.182 | meets target | 0.429 | 0.436 | meets target | 4.66 | growth detected | 346.26 |
| delete/reinsert tombstones | 1000 | 0.406 | 0.335 | meets target | 0.682 | 0.664 | meets target | 58.55 | growth detected | 353.23 |
| delete/reinsert tombstones | 10000 | 2.490 | 2.009 | meets target | 2.690 | 2.293 | meets target | 76.71 | growth detected | 381.11 |
| exact-item watchers | 1000 | 0.559 | 0.466 | meets target | 0.721 | 0.677 | meets target | 35.32 | growth detected | 504.71 |
| full-list watchers | 1000 | 1.969 | 0.981 | meets target | 2.176 | 1.231 | meets target | 41.54 | growth detected | 543.77 |
| hydrate with retained wrapper | 1000 | 0.420 | 0.346 | meets target | 0.626 | 0.543 | meets target | 61.36 | growth detected | 436.55 |
| exact-index result churn | 4096 | 1.006 | 0.847 | meets target | 7.170 | 3.260 | meets target | 18.19 | growth detected | 439.35 |
| orphan signal churn | 1024 | 0.111 | 0.111 | meets target | 0.379 | 0.379 | meets target | -52.09 | inconclusive | 231.87 |
| wrapper lifecycle churn | 1000 | 0.384 | 0.314 | meets target | 2.543 | 1.586 | meets target | 20.57 | growth detected | 562.28 |

## Interpretation

- Setup and steady heap represent expected retained state before teardown.
- Growth remains signed; repeatable signal requires all runs above matching empty-control envelope.
- Inconclusive means forced-GC noise overlaps control, not demonstrated improvement or regression.
- Teardown residual remains signed state after complete disposal.
