# Data Core v5/v6 CPU evidence snapshot

Generated: 2026-08-28T19:40:43.680Z

- Node: v23.9.0
- OS: Linux 7.1.8-200.fc44.x86_64 x64
- CPU: AMD Ryzen 9 9950X 16-Core Processor
- Data Core v5: 94768489abd6d53b883957b3f1b6ce22d66cffc3
- Data Core v6: working tree based on 94768489abd6d53b883957b3f1b6ce22d66cffc3
- Candidate diff SHA-256: a82738477dd0beee918652d2fba62f5e27238ab206fbaf63c1b28738c079f9d4
- Frozen legacy SHA-256: 82162b219cd12e711810bec7856c434a0df47614eb8d8c8309380dc4bbae8fb6

## Small-payload guard

- 49/59 rows meet median <=1.05 and conservative all-run <=1.10 limits.
- Misses: field-write-list-read, list-read, list-read, list-read, indexed-list-read, paused-write-batch, paused-write-batch, composite-index-read, nested-relation-write, serialize-state.
- Evidence remains informational; no CI performance gate applies.

| Scenario | Items | v5 us/op | v6 us/op | v6/v5 median | Conservative range | Result |
|---|---:|---:|---:|---:|---:|---|
| field write / list watchers | 100 | 0.245 | 0.180 | 0.736x | 0.716-0.868x | meets target |
| field write / list watchers | 1000 | 0.258 | 0.196 | 0.760x | 0.696-1.086x | meets target |
| field write / list watchers | 10000 | 0.249 | 0.218 | 0.877x | 0.756-0.934x | meets target |
| field write / item watchers | 100 | 0.349 | 0.290 | 0.830x | 0.783-0.909x | meets target |
| field write / item watchers | 1000 | 0.263 | 0.222 | 0.847x | 0.799-0.866x | meets target |
| field write / item watchers | 10000 | 0.261 | 0.222 | 0.849x | 0.729-0.887x | meets target |
| field write + imperative list read | 100 | 0.355 | 0.286 | 0.805x | 0.760-0.820x | meets target |
| field write + imperative list read | 1000 | 0.583 | 0.529 | 0.907x | 0.752-0.936x | meets target |
| field write + imperative list read | 10000 | 3.332 | 3.117 | 0.936x | 0.753-1.205x | misses target |
| replace / list watchers | 100 | 29.054 | 27.648 | 0.952x | 0.882-1.026x | meets target |
| replace / list watchers | 1000 | 132.273 | 131.826 | 0.997x | 0.897-1.066x | meets target |
| replace / list watchers | 10000 | 1484.887 | 1474.022 | 0.993x | 0.952-1.064x | meets target |
| read fields / 5 optimistic layers | 100 | 2.372 | 2.103 | 0.886x | 0.703-1.009x | meets target |
| read fields / 5 optimistic layers | 1000 | 25.765 | 18.245 | 0.708x | 0.579-0.802x | meets target |
| read fields / 5 optimistic layers | 10000 | 282.977 | 189.191 | 0.669x | 0.647-0.728x | meets target |
| relation read / unrelated writes | 100 | 0.336 | 0.316 | 0.940x | 0.750-1.057x | meets target |
| relation read / unrelated writes | 1000 | 0.352 | 0.337 | 0.957x | 0.720-1.043x | meets target |
| relation read / unrelated writes | 10000 | 0.359 | 0.348 | 0.970x | 0.789-1.054x | meets target |
| read item | 100 | 0.049 | 0.049 | 1.001x | 0.933-1.013x | meets target |
| read item | 1000 | 0.056 | 0.052 | 0.930x | 0.873-0.934x | meets target |
| read item | 10000 | 0.066 | 0.058 | 0.866x | 0.776-0.994x | meets target |
| composite index membership write | 1000 | 1.898 | 1.846 | 0.973x | 0.971-1.021x | meets target |
| read full list | 100 | 0.053 | 0.054 | 1.016x | 0.872-1.120x | misses target |
| read full list | 1000 | 0.246 | 0.262 | 1.066x | 0.845-1.336x | misses target |
| read full list | 10000 | 2.545 | 2.929 | 1.151x | 0.823-1.349x | misses target |
| read filtered limited list | 100 | 4.083 | 3.655 | 0.895x | 0.887-1.008x | meets target |
| read filtered limited list | 1000 | 3.953 | 3.614 | 0.914x | 0.874-1.000x | meets target |
| read filtered limited list | 10000 | 3.894 | 3.733 | 0.959x | 0.875-1.060x | meets target |
| read indexed list | 100 | 0.112 | 0.111 | 0.989x | 0.935-1.083x | meets target |
| read indexed list | 1000 | 0.131 | 0.131 | 1.003x | 0.924-1.084x | meets target |
| read indexed list | 10000 | 0.375 | 0.362 | 0.966x | 0.883-1.704x | misses target |
| write 100-item batch | 100 | 16.208 | 11.646 | 0.719x | 0.661-0.771x | meets target |
| write 100-item batch | 1000 | 16.843 | 11.373 | 0.675x | 0.643-0.737x | meets target |
| write 100-item batch | 10000 | 16.116 | 12.067 | 0.749x | 0.633-0.770x | meets target |
| pause / 20 writes / resume | 100 | 4.762 | 4.768 | 1.001x | 0.877-1.073x | meets target |
| pause / 20 writes / resume | 1000 | 4.896 | 4.939 | 1.009x | 0.964-1.241x | misses target |
| pause / 20 writes / resume | 10000 | 5.119 | 5.378 | 1.051x | 0.993-1.238x | misses target |
| relation membership write | 100 | 1.548 | 1.570 | 1.014x | 0.926-1.063x | meets target |
| relation membership write | 1000 | 1.825 | 1.810 | 0.992x | 0.962-1.033x | meets target |
| relation membership write | 10000 | 8.677 | 8.793 | 1.013x | 0.987-1.023x | meets target |
| relation read / related field writes | 1000 | 0.355 | 0.340 | 0.958x | 0.844-1.057x | meets target |
| read composite index | 100 | 0.172 | 0.168 | 0.976x | 0.832-1.031x | meets target |
| read composite index | 1000 | 0.197 | 0.188 | 0.954x | 0.852-0.983x | meets target |
| read composite index | 10000 | 0.439 | 0.440 | 1.004x | 0.848-1.155x | misses target |
| accepted CRDT field write | 1000 | 0.559 | 0.539 | 0.964x | 0.794-0.985x | meets target |
| rejected stale CRDT field write | 1000 | 0.376 | 0.358 | 0.952x | 0.669-0.965x | meets target |
| write parent + 10 nested children | 1000 | 5.900 | 5.537 | 0.938x | 0.870-1.121x | misses target |
| optimistic layer cycle | 100 | 2.916 | 2.276 | 0.781x | 0.767-0.879x | meets target |
| optimistic layer cycle | 1000 | 2.754 | 2.337 | 0.848x | 0.798-0.862x | meets target |
| optimistic layer cycle | 10000 | 2.750 | 2.271 | 0.826x | 0.728-0.872x | meets target |
| serialize cache state | 100 | 2.379 | 2.312 | 0.972x | 0.903-1.002x | meets target |
| serialize cache state | 1000 | 17.182 | 16.386 | 0.954x | 0.946-1.024x | meets target |
| serialize cache state | 10000 | 151.276 | 146.019 | 0.965x | 0.896-1.201x | misses target |
| hydrate cache state | 100 | 11.801 | 6.388 | 0.541x | 0.515-0.565x | meets target |
| hydrate cache state | 1000 | 92.455 | 41.494 | 0.449x | 0.423-0.472x | meets target |
| hydrate cache state | 10000 | 1320.883 | 549.286 | 0.416x | 0.394-0.450x | meets target |
| composite membership write / no watcher | 1000 | 0.864 | 0.874 | 1.011x | 0.957-1.040x | meets target |
| composite membership write / direct watcher | 1000 | 1.827 | 1.834 | 1.004x | 0.950-1.028x | meets target |
| scalar membership write / direct watcher | 1000 | 1.786 | 1.685 | 0.943x | 0.890-1.023x | meets target |

JSON companion retains every raw run, uncertainty fields, dimensions, medians, and envelopes.
