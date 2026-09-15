# Data Core v5/v6 big-payload evidence snapshot

Generated: 2026-08-28T19:40:43.675Z

## Environment and identities

- Node: v23.9.0
- OS: Linux 7.1.8-200.fc44.x86_64 x64
- CPU: AMD Ryzen 9 9950X 16-Core Processor
- Data Core v5: 94768489abd6d53b883957b3f1b6ce22d66cffc3
- Data Core v6: working tree based on 94768489abd6d53b883957b3f1b6ce22d66cffc3
- Candidate diff SHA-256: a82738477dd0beee918652d2fba62f5e27238ab206fbaf63c1b28738c079f9d4
- Frozen legacy SHA-256: 82162b219cd12e711810bec7856c434a0df47614eb8d8c8309380dc4bbae8fb6

## Summary

- Large-row duration geometric mean v6/v5: 0.811x.
- Every large row within 5% of v5 duration: yes.
- Large-row peak-RSS geometric mean v6/v5: inconclusive (inconclusive zero crossing).
- Every large row within 5% of v5 peak-RSS delta: no.
- Every large row lower retained heap than v5: yes.
- Every large row at paired legacy retained-heap parity: yes.
- Evidence remains informational; no CI performance gate applies.

## Rows

| Scenario | Dimensions | Source MiB | v5 ms | v6 ms | v6/v5 time | v5 retained MiB | v6 retained MiB | v6/v5 retained | v6/legacy retained | RSS result | Teardown KiB |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|
| empty store lifecycle | 1 items, 0 fields, 0 nested, 0 array, 1 ops | 0.00 | 0.01 | 0.01 | 1.062x [0.694x, 1.384x] | 0.11 | 0.11 | 0.999x [0.995x, 1.001x] | 2.502x [2.486x, 2.522x] | delta 0.00 MiB | 70.5 |
| input-only wide control | 10000 items, 64 fields, 0 nested, 0 array, 1 ops | 27.48 | 0.03 | 0.02 | 0.940x [0.678x, 1.163x] | 0.12 | 0.11 | 0.955x [0.952x, 0.958x] | 2.371x [2.365x, 2.387x] | delta 0.00 MiB | 75.4 |
| small three-field writeItems | 1000 items, 3 fields, 0 nested, 0 array, 1 ops | 0.04 | 1.82 | 1.31 | 0.722x [0.586x, 0.987x] | 0.39 | 0.32 | 0.810x [0.809x, 0.813x] | 0.709x [0.708x, 0.710x] | delta 0.00 MiB | 153.9 |
| small three-field replacement | 1000 items, 3 fields, 0 nested, 0 array, 1 ops | 0.09 | 0.65 | 0.35 | 0.549x [0.476x, 0.798x] | 0.71 | 0.64 | 0.895x [0.895x, 0.895x] | 0.786x [0.786x, 0.793x] | delta 0.00 MiB | 154.3 |
| small full-list wrappers | 1000 items, 3 fields, 0 nested, 0 array, 1 ops | 0.14 | 1.81 | 1.69 | 0.930x [0.842x, 1.101x] | 2.12 | 1.13 | 0.532x [0.531x, 0.532x] | 0.536x [0.535x, 0.536x] | delta 0.00 MiB | 262.8 |
| initial writeItems: 50k narrow | 50000 items, 3 fields, 0 nested, 0 array, 1 ops | 2.12 | 12.25 | 7.65 | 0.624x [0.581x, 0.699x] | 9.08 | 7.29 | 0.803x [0.803x, 0.803x] | 0.586x [0.585x, 0.586x] | delta -3.00 MiB | 172.4 |
| initial writeItems: 10k x 64 fields | 10000 items, 64 fields, 0 nested, 0 array, 1 ops | 27.48 | 49.80 | 47.29 | 0.950x [0.858x, 1.152x] | 80.32 | 79.83 | 0.994x [0.986x, 0.994x] | 0.988x [0.980x, 0.988x] | delta 0.00 MiB | 158.9 |
| initial writeItems: 2k mixed deep | 2000 items, 8 fields, 8 nested, 16 array, 1 ops | 6.71 | 8.77 | 5.77 | 0.657x [0.563x, 0.876x] | 14.94 | 14.84 | 0.993x [0.993x, 0.993x] | 0.985x [0.985x, 0.985x] | delta 0.00 MiB | 185.5 |
| partial replacement: 10k wide | 10000 items, 64 fields, 0 nested, 0 array, 1 ops | 13.80 | 120.18 | 119.36 | 0.993x [0.962x, 1.033x] | 81.82 | 81.31 | 0.994x [0.983x, 1.000x] | 0.991x [0.977x, 1.000x] | delta 0.00 MiB | 149.6 |
| getState: 10k wide | 10000 items, 64 fields, 0 nested, 0 array, 8 ops | 27.48 | 5.44 | 5.33 | 0.979x [0.538x, 1.222x] | 79.94 | 79.64 | 0.996x [0.989x, 0.999x] | 0.988x [0.984x, 0.991x] | delta 0.00 MiB | 179.6 |
| setState: 10k wide | 10000 items, 64 fields, 0 nested, 0 array, 1 ops | 27.55 | 4.94 | 3.51 | 0.710x [0.477x, 0.953x] | 80.28 | 79.82 | 0.994x [0.990x, 1.000x] | 0.989x [0.985x, 0.989x] | delta 0.00 MiB | 146.8 |
| full-list wrappers: 10k wide | 10000 items, 64 fields, 0 nested, 0 array, 1 ops | 27.48 | 12.01 | 7.50 | 0.625x [0.441x, 0.687x] | 94.42 | 84.78 | 0.898x [0.895x, 0.903x] | 0.900x [0.897x, 0.902x] | delta 0.00 MiB | 261.8 |
| scalar index: 50k records | 50000 items, 3 fields, 0 nested, 0 array, 1 ops | 2.66 | 24.37 | 17.44 | 0.716x [0.622x, 0.853x] | 10.55 | 8.80 | 0.834x [0.833x, 0.834x] | 0.559x [0.558x, 0.559x] | delta -1.49 MiB | 312.6 |
| composite index: 50k records | 50000 items, 3 fields, 0 nested, 0 array, 1 ops | 3.70 | 35.13 | 25.65 | 0.730x [0.600x, 0.830x] | 15.92 | 14.16 | 0.889x [0.889x, 0.889x] | 0.749x [0.748x, 0.749x] | delta 0.00 MiB | 308.6 |
| nested relations: 2k x 10 children | 2000 items, 3 fields, 0 nested, 0 array, 1 ops | 1.42 | 17.85 | 15.33 | 0.859x [0.703x, 0.954x] | 6.62 | 5.60 | 0.846x [0.846x, 0.847x] | 0.697x [0.696x, 0.697x] | delta -0.30 MiB | 350.0 |
| public findMany: 10k wide | 10000 items, 64 fields, 0 nested, 0 array, 1 ops | 27.48 | 93.00 | 88.57 | 0.952x [0.843x, 1.094x] | 94.74 | 85.15 | 0.899x [0.892x, 0.904x] | 0.682x [0.678x, 0.682x] | delta 0.00 MiB | 552.7 |
| public createMany: 10k wide | 10000 items, 64 fields, 0 nested, 0 array, 1 ops | 27.48 | 119.92 | 111.89 | 0.933x [0.872x, 1.205x] | 110.80 | 110.30 | 0.996x [0.990x, 1.001x] | 0.991x [0.986x, 0.991x] | delta 0.00 MiB | 247.8 |
| public updateMany: 10k wide | 10000 items, 64 fields, 0 nested, 0 array, 1 ops | 13.80 | 189.19 | 186.08 | 0.984x [0.939x, 1.152x] | 115.65 | 106.05 | 0.917x [0.908x, 0.925x] | 0.552x [0.547x, 0.553x] | delta 0.00 MiB | 595.0 |

## Interpretation

- Duration and retained-heap ratios are lower-is-better.
- RSS and retained values crossing zero use signed absolute deltas, shown as `delta`, instead of invalid ratios.
- Retained heap is live cache state after caller source release and five forced-GC passes.
- Teardown residual is signed heap remaining after references release and cache disposal.
- JSON companion retains all five raw runs, ranges, conservative envelopes, checkpoints, and dimensions.
