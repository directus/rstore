# RStore cache performance: legacy vs Data Core v1 vs Data Core v2

Generated 2026-08-27 from Data Core v1 commit `30318e8cae55ae623b112865c8ae04c4c6d43242` and current Data Core v2 working tree based on same commit.

## Result

Data Core v2 closes all statistically clear legacy regressions in three final full runs: 59/59 faster, 58/59 faster plus one no-clear row, then 59/59 faster. No row classified legacy faster. Median normalized comparison makes v2 faster than v1 on 39/59 rows and slower on 20/59 rows. Conservative cross-run interval envelopes classify 30 v2 faster, 14 v2 slower, and 15 overlapping.

| Target workload | Items | v1 vs legacy | v2 vs legacy | v2 vs v1 |
| --- | ---: | ---: | ---: | ---: |
| read fields / 5 optimistic layers | 100 | 0.58x | 3.92x | 6.75x |
| read fields / 5 optimistic layers | 1,000 | 0.59x | 3.79x | 6.46x |
| read fields / 5 optimistic layers | 10,000 | 0.53x | 3.42x | 6.43x |
| read item | 100 | 1.02x | 3.49x | 3.42x |
| read item | 1,000 | 0.94x | 3.17x | 3.36x |
| read item | 10,000 | 0.71x | 3.19x | 4.50x |
| composite index membership write | 1,000 | 0.65x | 1.19x | 1.82x |

## Method

- Machine: AMD Ryzen 9 9950X, 16 cores/32 threads; Linux 7.1.8 x86_64; Node v23.9.0; pnpm 10.20.0.
- Full profile: 59 scenario/dimension rows, 20 watchers where applicable, 1,000 ms measured tasks, 200 ms warmup, 20 minimum iterations, 3% RME threshold.
- Data Core v1: three isolated full runs at commit `30318e8` for 56 original rows. Three isolated decomposition runs cover three new rows plus repeated composite membership control. V1 source, Core build, dependencies, and Vue runtime stayed inside detached worktree.
- Data Core v2: three final full runs from current working tree. Each over-threshold row used bounded 4x, 16x, then 32x retries.
- Semantic validation and reactive rerun checks executed outside timed regions.
- Times below are medians. Version-vs-legacy ratios are medians of paired same-process speedups, reducing cross-run machine drift. V2-vs-v1 divides normalized median speedups.

## Run quality

| Version | Run | Rows | Faster | Legacy faster | No clear | Noisy | Max RME |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Data Core v1 | 1 | 56 | 48 | 7 | 0 | 1 | 8.35% |
| Data Core v1 | 2 | 56 | 47 | 6 | 1 | 2 | 8.36% |
| Data Core v1 | 3 | 56 | 47 | 6 | 0 | 3 | 13.76% |
| Data Core v2 | 1 | 59 | 59 | 0 | 0 | 0 | 2.90% |
| Data Core v2 | 2 | 59 | 58 | 0 | 1 | 0 | 2.98% |
| Data Core v2 | 3 | 59 | 59 | 0 | 0 | 0 | 2.88% |

V1 old runner stopped after one 2x retry. Remaining noisy rows: relation membership write at 10,000 items in all three runs; field-write/list-watchers and replace/list-watchers at 10,000 in run 3; hydrate at 10,000 in run 2. V1 item read at 100 items was no-clear in run 2. V2 only no-clear result was direct composite watcher in run 2 at 0.996x; runs 1 and 3 classified it faster.

## Clear v2 regressions versus v1

These rows remain faster than legacy, but conservative v2/v1 interval envelopes do not overlap parity. If acceptance requires preserving v1 throughput, gate is not met.

| Scenario ID | Items | v2/v1 median | Conservative envelope | v2/legacy |
| --- | ---: | ---: | ---: | ---: |
| field-write-list-watchers | 100 | 0.77x | 0.69x-0.83x | 2,351x |
| field-write-list-watchers | 1,000 | 0.68x | 0.62x-0.78x | 22,469x |
| field-write-list-watchers | 10,000 | 0.66x | 0.57x-0.78x | 220,020x |
| field-write-list-read | 100 | 0.90x | 0.82x-0.96x | 43.78x |
| batch-write | 100 | 0.71x | 0.67x-0.74x | 1.60x |
| batch-write | 1,000 | 0.70x | 0.65x-0.74x | 1.52x |
| batch-write | 10,000 | 0.73x | 0.66x-0.86x | 1.49x |
| paused-write-batch | 100 | 0.78x | 0.72x-0.81x | 1.53x |
| paused-write-batch | 1,000 | 0.75x | 0.69x-0.80x | 1.47x |
| paused-write-batch | 10,000 | 0.79x | 0.70x-0.85x | 1.42x |
| crdt-stale-write | 1,000 | 0.91x | 0.87x-0.97x | 1.12x |
| hydrate-state | 100 | 0.80x | 0.68x-0.96x | 1.83x |
| hydrate-state | 1,000 | 0.81x | 0.71x-0.93x | 2.26x |
| hydrate-state | 10,000 | 0.82x | 0.69x-0.96x | 1.59x |

## Full median report

| Scenario ID | Items | Legacy µs/op | Data Core v1 µs/op | Data Core v2 µs/op | v1/legacy | v2/legacy | v2/v1 | v2/v1 envelope | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| field-write-list-watchers | 100 | 1,698 | 0.599 | 0.716 | 3,071x | 2,351x | 0.77x | 0.69x-0.83x | v2 slower |
| field-write-list-watchers | 1,000 | 17,339 | 0.601 | 0.756 | 33,004x | 22,469x | 0.68x | 0.62x-0.78x | v2 slower |
| field-write-list-watchers | 10,000 | 220,624 | 0.725 | 0.937 | 332,210x | 220,020x | 0.66x | 0.57x-0.78x | v2 slower |
| field-write-item-watchers | 100 | 11.83 | 0.878 | 0.726 | 14.44x | 15.86x | 1.10x | 1.04x-1.25x | v2 faster |
| field-write-item-watchers | 1,000 | 11.79 | 0.691 | 0.696 | 17.69x | 16.48x | 0.93x | 0.88x-1.02x | overlap |
| field-write-item-watchers | 10,000 | 11.90 | 0.723 | 0.739 | 17.13x | 15.84x | 0.92x | 0.86x-1.01x | overlap |
| field-write-list-read | 100 | 38.20 | 0.835 | 0.854 | 48.79x | 43.78x | 0.90x | 0.82x-0.96x | v2 slower |
| field-write-list-read | 1,000 | 373.7 | 1.252 | 1.145 | 312.32x | 321.08x | 1.03x | 0.97x-1.14x | overlap |
| field-write-list-read | 10,000 | 4,309 | 4.414 | 3.570 | 1,033x | 1,166x | 1.13x | 0.91x-1.22x | overlap |
| replace-list-watchers | 100 | 3,727 | 36.69 | 31.86 | 106.84x | 107.77x | 1.01x | 0.95x-1.11x | overlap |
| replace-list-watchers | 1,000 | 38,091 | 197.4 | 153.6 | 207.75x | 236.43x | 1.14x | 1.00x-1.29x | overlap |
| replace-list-watchers | 10,000 | 447,944 | 2,086 | 1,626 | 238.07x | 255.64x | 1.07x | 0.84x-1.25x | overlap |
| layer-field-read | 100 | 12.78 | 24.11 | 3.126 | 0.58x | 3.92x | 6.75x | 6.42x-7.03x | v2 faster |
| layer-field-read | 1,000 | 139.7 | 256.7 | 33.70 | 0.59x | 3.79x | 6.46x | 6.12x-6.99x | v2 faster |
| layer-field-read | 10,000 | 1,486 | 2,990 | 415.7 | 0.53x | 3.42x | 6.43x | 5.87x-8.84x | v2 faster |
| relation-unrelated-write | 100 | 6.506 | 0.894 | 0.798 | 7.71x | 7.52x | 0.98x | 0.93x-1.10x | overlap |
| relation-unrelated-write | 1,000 | 6.572 | 0.945 | 0.829 | 7.22x | 7.50x | 1.04x | 0.86x-1.13x | overlap |
| relation-unrelated-write | 10,000 | 6.571 | 1.010 | 0.955 | 6.73x | 6.64x | 0.99x | 0.83x-1.06x | overlap |
| item-read | 100 | 0.394 | 0.425 | 0.110 | 1.02x | 3.49x | 3.42x | 3.31x-4.02x | v2 faster |
| item-read | 1,000 | 0.398 | 0.428 | 0.123 | 0.94x | 3.17x | 3.36x | 3.10x-3.52x | v2 faster |
| item-read | 10,000 | 0.437 | 0.623 | 0.136 | 0.71x | 3.19x | 4.50x | 3.02x-5.48x | v2 faster |
| composite-index-membership-write | 1,000 | 3.146 | 5.203 | 2.554 | 0.65x | 1.19x | 1.82x | 1.68x-2.04x | v2 faster |
| list-read | 100 | 40.26 | 0.107 | 0.058 | 390.91x | 676.78x | 1.73x | 1.60x-2.05x | v2 faster |
| list-read | 1,000 | 406.6 | 0.316 | 0.236 | 1,309x | 1,684x | 1.29x | 1.08x-2.88x | v2 faster |
| list-read | 10,000 | 4,666 | 2.556 | 2.161 | 1,867x | 2,154x | 1.15x | 1.08x-1.88x | v2 faster |
| filtered-list-read | 100 | 23.17 | 16.51 | 5.371 | 1.42x | 4.24x | 2.98x | 2.87x-3.12x | v2 faster |
| filtered-list-read | 1,000 | 140.0 | 17.32 | 5.471 | 8.26x | 25.25x | 3.06x | 2.92x-3.21x | v2 faster |
| filtered-list-read | 10,000 | 1,899 | 20.34 | 7.437 | 93.96x | 247.83x | 2.64x | 2.41x-2.94x | v2 faster |
| indexed-list-read | 100 | 3.922 | 1.456 | 0.847 | 2.75x | 4.54x | 1.65x | 1.56x-1.74x | v2 faster |
| indexed-list-read | 1,000 | 29.81 | 10.05 | 6.578 | 3.06x | 4.31x | 1.41x | 1.34x-1.53x | v2 faster |
| indexed-list-read | 10,000 | 287.6 | 92.74 | 62.22 | 3.38x | 4.46x | 1.32x | 1.26x-1.49x | v2 faster |
| batch-write | 100 | 78.85 | 35.76 | 49.18 | 2.24x | 1.60x | 0.71x | 0.67x-0.74x | v2 slower |
| batch-write | 1,000 | 78.61 | 37.35 | 51.80 | 2.17x | 1.52x | 0.70x | 0.65x-0.74x | v2 slower |
| batch-write | 10,000 | 81.19 | 42.62 | 53.36 | 2.03x | 1.49x | 0.73x | 0.66x-0.86x | v2 slower |
| paused-write-batch | 100 | 15.98 | 8.133 | 10.47 | 1.96x | 1.53x | 0.78x | 0.72x-0.81x | v2 slower |
| paused-write-batch | 1,000 | 16.35 | 8.630 | 11.11 | 1.95x | 1.47x | 0.75x | 0.69x-0.80x | v2 slower |
| paused-write-batch | 10,000 | 16.99 | 10.06 | 11.74 | 1.80x | 1.42x | 0.79x | 0.70x-0.85x | v2 slower |
| relation-membership-write | 100 | 6.886 | 3.730 | 2.107 | 1.91x | 3.17x | 1.66x | 1.50x-1.77x | v2 faster |
| relation-membership-write | 1,000 | 7.558 | 3.954 | 2.409 | 1.94x | 3.03x | 1.56x | 1.45x-1.82x | v2 faster |
| relation-membership-write | 10,000 | 20.54 | 10.90 | 9.207 | 1.88x | 2.25x | 1.20x | 0.95x-1.56x | overlap |
| relation-related-field-write | 1,000 | 12.25 | 0.943 | 0.889 | 14.54x | 13.22x | 0.91x | 0.79x-1.03x | overlap |
| composite-index-read | 100 | 3.932 | 1.590 | 0.992 | 2.83x | 3.90x | 1.38x | 1.27x-1.49x | v2 faster |
| composite-index-read | 1,000 | 29.77 | 10.97 | 6.698 | 3.16x | 4.28x | 1.35x | 1.23x-1.46x | v2 faster |
| composite-index-read | 10,000 | 291.3 | 95.41 | 62.41 | 3.22x | 4.51x | 1.40x | 1.28x-1.46x | v2 faster |
| crdt-fresh-write | 1,000 | 1.195 | 1.003 | 1.020 | 1.21x | 1.18x | 0.98x | 0.79x-1.02x | overlap |
| crdt-stale-write | 1,000 | 1.191 | 1.032 | 1.042 | 1.23x | 1.12x | 0.91x | 0.87x-0.97x | v2 slower |
| nested-relation-write | 1,000 | 11.30 | 9.074 | 6.901 | 1.26x | 1.65x | 1.31x | 1.23x-1.35x | v2 faster |
| layer-cycle | 100 | 31.12 | 3.840 | 3.245 | 8.35x | 9.56x | 1.15x | 1.06x-1.31x | v2 faster |
| layer-cycle | 1,000 | 285.9 | 3.972 | 3.230 | 73.57x | 87.40x | 1.19x | 1.01x-1.27x | v2 faster |
| layer-cycle | 10,000 | 3,429 | 3.934 | 3.219 | 947.16x | 1,007x | 1.06x | 0.89x-1.25x | overlap |
| serialize-state | 100 | 26.69 | 2.380 | 2.154 | 11.36x | 11.74x | 1.03x | 0.97x-1.20x | overlap |
| serialize-state | 1,000 | 255.0 | 19.64 | 15.73 | 14.35x | 15.50x | 1.08x | 1.02x-1.31x | v2 faster |
| serialize-state | 10,000 | 3,070 | 159.4 | 137.5 | 19.53x | 21.53x | 1.10x | 1.01x-1.22x | v2 faster |
| hydrate-state | 100 | 56.70 | 25.13 | 29.54 | 2.28x | 1.83x | 0.80x | 0.68x-0.96x | v2 slower |
| hydrate-state | 1,000 | 550.7 | 201.4 | 238.6 | 2.78x | 2.26x | 0.81x | 0.71x-0.93x | v2 slower |
| hydrate-state | 10,000 | 5,569 | 2,793 | 3,421 | 1.94x | 1.59x | 0.82x | 0.69x-0.96x | v2 slower |
| composite-write-no-watcher | 1,000 | 2.138 | 2.093 | 1.451 | 1.02x | 1.52x | 1.48x | 1.37x-1.55x | v2 faster |
| composite-write-direct-watcher | 1,000 | 2.425 | 3.780 | 2.409 | 0.64x | 1.04x | 1.62x | 1.52x-1.69x | v2 faster |
| scalar-write-direct-watcher | 1,000 | 6.140 | 2.979 | 2.295 | 2.16x | 2.59x | 1.20x | 1.11x-1.43x | v2 faster |

## Interpretation

- Layered field reads moved from clear regressions in v1 to 3.38-3.97x legacy throughput in v2.
- Item reads moved from 0.62-1.02x legacy across v1 runs to 2.73-3.51x in v2.
- Composite membership writes moved from 0.60-0.67x legacy across v1 full runs to 1.15-1.19x in v2; focused v1 decomposition control measured 0.60-0.63x.
- Direct composite watcher remains tightest row: median v2 result stays slightly faster than legacy, with one no-clear run. This is main residual optimization risk.
- V2 pays clear throughput cost versus v1 in several already-fast write paths, especially list-watcher field writes, 100-item batches, paused batches, and hydration. These remain faster than legacy but are follow-up targets.
- Absolute microseconds compare separate run sets; paired normalized ratios are preferred for version conclusions.

Machine-readable companion: `data-core-v1-v2.json`.
