# Data Core v1/v2/v3/v4/v5 performance evidence snapshot

Generated: 2026-08-28T14:13:40.205Z

## Environment and versions

- CPU: AMD Ryzen 9 9950X 16-Core Processor
- OS: Linux 7.1.8-200.fc44.x86_64 x64
- Node: v23.9.0
- pnpm: 10.20.0
- Legacy: packages/vue/benchmark/legacy-cache.ts
- Data Core v1: 30318e8cae55ae623b112865c8ae04c4c6d43242
- Data Core v2: ffdc11cab53301233881c0512ac5139118779ca9
- Data Core v3: 98cc5a7fb6b48f92d3eff4d0b54f23fdd4bf701c
- Data Core v4: a7baec77dea8601c52ba40cddf93d08d27055274
- Data Core v5: uncommitted working tree based on a7baec77dea8601c52ba40cddf93d08d27055274
- Candidate diff SHA-256: 5207f9d917229f2928bd4a8ffdbd2f492b715f7632a8dcbd75ea24f5d4dfd461

## Acceptance summary

- Run 1: 59/59 engine faster, 0 legacy faster, 0 no clear difference, 0 noisy; max RME 2.988%; retries 5.
- Run 2: 59/59 engine faster, 0 legacy faster, 0 no clear difference, 0 noisy; max RME 2.995%; retries 5.
- Run 3: 59/59 engine faster, 0 legacy faster, 0 no clear difference, 0 noisy; max RME 3.000%; retries 10.
- CPU target: 59/59 rows meet median <=10% and conservative all-run <=15% slowdown versus same-machine v4.
- Typical v5 throughput change versus v4: 10.4% faster.
- Typical v5 throughput gain versus v3: 86.6% faster.
- Clear v5 regressions versus v4: 0.
- Cache ownership: 128 weak index results, at most 1024 strongly cached hot wrapper references, zero orphan signals.
- Evidence snapshot remains informational; no CI performance gate applies.

## How to read comparisons

- Each Data Core version is normalized by legacy measured beside it before cross-version comparison.
- Direct target uses engine duration: lower is faster. Version comparison cells use throughput: higher is faster.
- Conservative envelope includes every candidate/baseline run pairing.
- RME is benchmark uncertainty. Companion JSON retains raw runs, ratios, counts, retries, and intervals.

## All benchmark rows

| Scenario | Items | Legacy µs | v1 µs | v2 µs | v3 µs | v4 µs | v5 µs | v5/v4 duration | CPU target | v5 vs legacy | v5 vs v4 throughput |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|
| field write / list watchers | 100 | 1674.7 | 0.599 | 0.738 | 0.329 | 0.248 | 0.239 | 0.965 [0.903–0.977] | meets target | 6920.4–7089.3x faster | 6.44% faster; unclear (0.56% slower to 14.6% faster) |
| field write / list watchers | 1000 | 17428.7 | 0.601 | 0.807 | 0.340 | 0.257 | 0.242 | 0.941 [0.852–0.973] | meets target | 69972.0–74535.0x faster | 7.77% faster; unclear (1.32% slower to 16.4% faster) |
| field write / list watchers | 10000 | 213534.9 | 0.725 | 1.119 | 0.397 | 0.282 | 0.252 | 0.895 [0.879–0.966] | meets target | 811439.8–864421.1x faster | 14.2% faster; plausible 1.9–24.4% faster |
| field write / item watchers | 100 | 11.14 | 0.878 | 0.795 | 0.509 | 0.361 | 0.338 | 0.936 [0.844–0.981] | meets target | 30.55–34.32x faster | 5.52% faster; unclear (7.07% slower to 15.2% faster) |
| field write / item watchers | 1000 | 10.91 | 0.691 | 0.745 | 0.407 | 0.288 | 0.272 | 0.946 [0.842–0.996] | meets target | 38.66–42.59x faster | 3.23% faster; unclear (6.28% slower to 13.3% faster) |
| field write / item watchers | 10000 | 10.79 | 0.723 | 0.900 | 0.398 | 0.287 | 0.273 | 0.951 [0.855–0.978] | meets target | 39.28–42.81x faster | 1.71% faster; unclear (3.85% slower to 12.2% faster) |
| field write + imperative list read | 100 | 36.23 | 0.835 | 0.923 | 0.510 | 0.380 | 0.346 | 0.911 [0.853–1.019] | meets target | 101.4–110.4x faster | 15.5% faster; unclear (2.74% slower to 22.8% faster) |
| field write + imperative list read | 1000 | 361.3 | 1.252 | 1.418 | 0.735 | 0.673 | 0.557 | 0.827 [0.820–0.984] | meets target | 627.8–683.8x faster | 19.4% faster; unclear (0.81% slower to 34.9% faster) |
| field write + imperative list read | 10000 | 4189.2 | 4.414 | 4.853 | 3.005 | 2.642 | 2.807 | 1.062 [0.824–1.110] | meets target | 1427.4–1596.2x faster | 6.4% slower; unclear (20.1% slower to 24.1% faster) |
| replace / list watchers | 100 | 3572.2 | 36.69 | 35.42 | 30.49 | 27.41 | 27.14 | 0.990 [0.902–1.079] | meets target | 127.4–134.8x faster | 1.09% faster; unclear (9.2% slower to 15.5% faster) |
| replace / list watchers | 1000 | 36132.9 | 197.4 | 162.0 | 161.4 | 134.0 | 129.1 | 0.963 [0.932–1.012] | meets target | 271.6–289.9x faster | 2.19% faster; unclear (6.35% slower to 14.1% faster) |
| replace / list watchers | 10000 | 422477.5 | 2085.6 | 1852.4 | 1769.7 | 1503.5 | 1440.1 | 0.958 [0.890–1.017] | meets target | 285.4–336.7x faster | 1.5% slower; unclear (10% slower to 21.1% faster) |
| read fields / 5 optimistic layers | 100 | 11.04 | 24.11 | 3.160 | 3.314 | 2.979 | 2.258 | 0.758 [0.651–0.809] | meets target | 4.857–4.993x faster | 20.9% faster; plausible 16–38.7% faster |
| read fields / 5 optimistic layers | 1000 | 114.9 | 256.7 | 33.09 | 39.03 | 32.98 | 24.00 | 0.728 [0.685–0.812] | meets target | 4.582–4.807x faster | 23.6% faster; plausible 12.4–28.5% faster |
| read fields / 5 optimistic layers | 10000 | 1237.3 | 2989.7 | 422.2 | 437.2 | 323.0 | 264.7 | 0.819 [0.652–0.868] | meets target | 4.675–4.833x faster | 13.3% faster; plausible 4.82–41.9% faster |
| relation read / unrelated writes | 100 | 6.243 | 0.894 | 0.831 | 0.483 | 0.379 | 0.345 | 0.910 [0.883–0.955] | meets target | 17.56–18.27x faster | 11.2% faster; plausible 2.55–18.9% faster |
| relation read / unrelated writes | 1000 | 6.355 | 0.945 | 0.891 | 0.498 | 0.412 | 0.353 | 0.857 [0.825–0.906] | meets target | 17.51–18.69x faster | 17.4% faster; plausible 10.3–30.4% faster |
| relation read / unrelated writes | 10000 | 6.312 | 1.010 | 0.953 | 0.572 | 0.418 | 0.351 | 0.840 [0.827–0.942] | meets target | 17.18–17.99x faster | 15.1% faster; plausible 7.07–26.4% faster |
| read item | 100 | 0.342 | 0.425 | 0.113 | 0.082 | 0.066 | 0.050 | 0.747 [0.729–0.795] | meets target | 6.652–6.889x faster | 27.3% faster; plausible 16.9–31.5% faster |
| read item | 1000 | 0.347 | 0.428 | 0.138 | 0.094 | 0.076 | 0.057 | 0.753 [0.723–0.776] | meets target | 5.876–6.218x faster | 29.8% faster; plausible 20.9–35% faster |
| read item | 10000 | 0.377 | 0.623 | 0.143 | 0.101 | 0.096 | 0.061 | 0.638 [0.596–0.705] | meets target | 5.846–6.769x faster | 53.3% faster; plausible 30.5–93.1% faster |
| composite index membership write | 1000 | 3.015 | 5.203 | 2.588 | 2.349 | 1.912 | 1.888 | 0.988 [0.967–1.036] | meets target | 1.560–1.599x faster | 2.8% faster; unclear (5.17% slower to 6.53% faster) |
| read full list | 100 | 38.52 | 0.107 | 0.062 | 0.057 | 0.055 | 0.050 | 0.908 [0.770–0.978] | meets target | 722.2–771.0x faster | 7.86% faster; unclear (2.59% slower to 14.2% faster) |
| read full list | 1000 | 394.0 | 0.316 | 0.255 | 0.241 | 0.239 | 0.215 | 0.900 [0.656–1.100] | meets target | 1532.3–1893.1x faster | 13.5% faster; unclear (13.9% slower to 57.8% faster) |
| read full list | 10000 | 4526.7 | 2.556 | 2.611 | 2.384 | 2.957 | 2.131 | 0.721 [0.680–1.017] | meets target | 1981.8–2164.4x faster | 16.9% faster; unclear (6.14% slower to 32.4% faster) |
| read filtered limited list | 100 | 22.76 | 16.51 | 5.598 | 5.670 | 4.512 | 4.156 | 0.921 [0.852–0.928] | meets target | 5.356–5.831x faster | 7.58% faster; unclear (1.33% slower to 16.1% faster) |
| read filtered limited list | 1000 | 137.2 | 17.32 | 5.608 | 5.729 | 4.337 | 3.944 | 0.909 [0.869–1.024] | meets target | 30.96–36.35x faster | 6.12% faster; unclear (10.5% slower to 14.7% faster) |
| read filtered limited list | 10000 | 1874.4 | 20.34 | 8.142 | 7.783 | 4.541 | 3.864 | 0.851 [0.845–0.884] | meets target | 462.5–488.1x faster | 12.4% faster; unclear (4.88% slower to 23.1% faster) |
| read indexed list | 100 | 3.810 | 1.456 | 0.865 | 0.861 | 0.147 | 0.111 | 0.752 [0.708–0.762] | meets target | 34.13–36.00x faster | 31.6% faster; plausible 2.4–44.1% faster |
| read indexed list | 1000 | 29.01 | 10.05 | 6.622 | 6.628 | 0.181 | 0.122 | 0.673 [0.668–0.691] | meets target | 233.9–238.1x faster | 46.1% faster; plausible 37.7–51.7% faster |
| read indexed list | 10000 | 284.8 | 92.74 | 62.74 | 61.53 | 0.372 | 0.316 | 0.848 [0.658–0.886] | meets target | 890.7–910.7x faster | 19.1% faster; plausible 9.02–55.7% faster |
| write 100-item batch | 100 | 77.13 | 35.76 | 48.89 | 26.53 | 16.92 | 16.41 | 0.970 [0.887–1.034] | meets target | 4.664–4.869x faster | 7.24% faster; unclear (6.61% slower to 13% faster) |
| write 100-item batch | 1000 | 77.87 | 37.35 | 50.71 | 26.58 | 17.09 | 16.43 | 0.961 [0.823–1.017] | meets target | 4.645–4.838x faster | 7.86% faster; unclear (3.98% slower to 25.4% faster) |
| write 100-item batch | 10000 | 78.78 | 42.62 | 55.28 | 27.89 | 17.44 | 16.86 | 0.967 [0.896–1.069] | meets target | 4.427–4.798x faster | 2.91% faster; unclear (8.88% slower to 10.5% faster) |
| pause / 20 writes / resume | 100 | 15.91 | 8.133 | 10.98 | 6.125 | 5.110 | 4.869 | 0.953 [0.857–1.011] | meets target | 3.198–3.358x faster | 6.44% faster; plausible 0.99–14.7% faster |
| pause / 20 writes / resume | 1000 | 15.96 | 8.630 | 11.40 | 6.508 | 5.239 | 4.936 | 0.942 [0.867–0.987] | meets target | 3.175–3.363x faster | 4.26% faster; plausible 0.54–16.2% faster |
| pause / 20 writes / resume | 10000 | 16.25 | 10.06 | 12.35 | 6.580 | 5.742 | 5.218 | 0.909 [0.845–0.984] | meets target | 3.103–3.311x faster | 6.11% faster; plausible 0.26–20.6% faster |
| relation membership write | 100 | 6.585 | 3.730 | 2.127 | 1.975 | 1.578 | 1.513 | 0.959 [0.934–1.010] | meets target | 4.353–4.452x faster | 0.63% faster; unclear (4.75% slower to 12.1% faster) |
| relation membership write | 1000 | 7.198 | 3.954 | 2.489 | 2.269 | 1.846 | 1.806 | 0.978 [0.941–0.990] | meets target | 3.972–4.123x faster | 0.21% faster; unclear (6.1% slower to 9.27% faster) |
| relation membership write | 10000 | 20.61 | 10.90 | 9.394 | 9.240 | 8.677 | 8.582 | 0.989 [0.985–1.004] | meets target | 2.401–2.408x faster | 0.57% slower; unclear (11.5% slower to 11.9% faster) |
| relation read / related field writes | 1000 | 11.73 | 0.943 | 0.910 | 0.492 | 0.385 | 0.361 | 0.938 [0.888–1.016] | meets target | 30.56–33.23x faster | 4.66% faster; unclear (4.15% slower to 16.3% faster) |
| read composite index | 100 | 3.896 | 1.590 | 1.009 | 0.982 | 0.220 | 0.192 | 0.871 [0.736–0.883] | meets target | 20.31–22.51x faster | 22.1% faster; plausible 8.45–40.1% faster |
| read composite index | 1000 | 28.57 | 10.97 | 7.009 | 6.912 | 0.264 | 0.197 | 0.748 [0.669–0.804] | meets target | 144.8–155.1x faster | 29.1% faster; plausible 18.5–41.8% faster |
| read composite index | 10000 | 281.3 | 95.41 | 64.02 | 62.57 | 0.454 | 0.372 | 0.820 [0.710–1.030] | meets target | 632.0–775.6x faster | 24.9% faster; unclear (10.3% slower to 48.9% faster) |
| accepted CRDT field write | 1000 | 1.084 | 1.003 | 1.141 | 0.771 | 0.551 | 0.534 | 0.969 [0.893–1.017] | meets target | 1.964–2.064x faster | 1.68% faster; unclear (4.58% slower to 11% faster) |
| rejected stale CRDT field write | 1000 | 0.813 | 1.032 | 1.090 | 0.547 | 0.407 | 0.368 | 0.905 [0.837–0.980] | meets target | 2.107–2.346x faster | 5.71% faster; unclear (0.27% slower to 25.4% faster) |
| write parent + 10 nested children | 1000 | 10.93 | 9.074 | 6.969 | 6.424 | 5.875 | 5.603 | 0.954 [0.916–1.099] | meets target | 1.869–1.960x faster | 3.83% faster; unclear (5.52% slower to 7.44% faster) |
| optimistic layer cycle | 100 | 30.26 | 3.840 | 3.539 | 3.518 | 3.349 | 2.814 | 0.840 [0.732–0.898] | meets target | 10.61–11.53x faster | 16.7% faster; unclear (7.29% slower to 43.7% faster) |
| optimistic layer cycle | 1000 | 272.0 | 3.972 | 3.471 | 3.330 | 3.525 | 2.764 | 0.784 [0.629–0.824] | meets target | 98.40–99.13x faster | 28% faster; unclear (1.86% slower to 57.5% faster) |
| optimistic layer cycle | 10000 | 3235.3 | 3.934 | 3.694 | 3.530 | 3.475 | 2.832 | 0.815 [0.751–0.965] | meets target | 1072.1–1197.1x faster | 11.7% faster; unclear (4.66% slower to 44.6% faster) |
| serialize cache state | 100 | 25.38 | 2.380 | 2.409 | 2.233 | 2.166 | 2.195 | 1.014 [0.948–1.073] | meets target | 11.18–11.76x faster | 7.3% slower; unclear (13.5% slower to 3.86% faster) |
| serialize cache state | 1000 | 245.4 | 19.64 | 17.50 | 16.34 | 16.35 | 16.36 | 1.001 [0.967–1.057] | meets target | 14.03–15.31x faster | 5.4% slower; unclear (16.1% slower to 4.18% faster) |
| serialize cache state | 10000 | 3025.0 | 159.4 | 153.3 | 147.5 | 140.8 | 151.5 | 1.076 [1.027–1.149] | meets target | 19.68–20.88x faster | 14.1% slower; unclear (18% slower to 2.36% faster) |
| hydrate cache state | 100 | 54.74 | 25.13 | 31.79 | 26.00 | 13.42 | 11.33 | 0.844 [0.810–0.908] | meets target | 4.525–4.850x faster | 15.8% faster; unclear (3.28% slower to 28.1% faster) |
| hydrate cache state | 1000 | 537.6 | 201.4 | 251.8 | 208.2 | 101.2 | 87.64 | 0.866 [0.837–0.903] | meets target | 6.099–6.229x faster | 14.1% faster; unclear (1.92% slower to 25.3% faster) |
| hydrate cache state | 10000 | 5299.0 | 2793.4 | 3562.4 | 2942.5 | 1535.4 | 1248.5 | 0.813 [0.779–0.821] | meets target | 4.235–4.278x faster | 20.2% faster; plausible 9.5–31.7% faster |
| composite membership write / no watcher | 1000 | 2.170 | 2.093 | 1.462 | 0.973 | 0.866 | 0.867 | 1.002 [0.971–1.036] | meets target | 2.429–2.533x faster | 1.45% faster; unclear (4.07% slower to 4.19% faster) |
| composite membership write / direct watcher | 1000 | 2.411 | 3.780 | 2.427 | 2.246 | 1.723 | 1.730 | 1.004 [0.967–1.036] | meets target | 1.387–1.404x faster | 0.34% faster; unclear (2.11% slower to 4.98% faster) |
| scalar membership write / direct watcher | 1000 | 5.831 | 2.979 | 2.276 | 2.133 | 1.683 | 1.669 | 0.992 [0.940–1.035] | meets target | 3.492–3.536x faster | 2.08% slower; unclear (8.19% slower to 12.7% faster) |

## Data Core v5 per-run evidence

| Scenario | Items | Run 1 | Run 2 | Run 3 | Paired legacy intervals |
|---|---:|---|---|---|---|
| field-write-list-watchers | 100 | 0.242 µs; 4127859 ops/s; RME 0.423%; n=252; retry=0 | 0.235 µs; 4254602 ops/s; RME 0.242%; n=260; retry=0 | 0.239 µs; 4179808 ops/s; RME 0.383%; n=256; retry=0 | 6849.9–6991.5; 7046.8–7131.9; 6944.3–7055.8 |
| field-write-list-watchers | 1000 | 0.242 µs; 4130377 ops/s; RME 0.433%; n=253; retry=0 | 0.230 µs; 4339930 ops/s; RME 0.605%; n=265; retry=0 | 0.249 µs; 4014751 ops/s; RME 0.541%; n=246; retry=0 | 71333.8–74049.7; 73413.9–75669.8; 69034.5–70919.6 |
| field-write-list-watchers | 10000 | 0.262 µs; 3822404 ops/s; RME 0.525%; n=234; retry=0 | 0.252 µs; 3965735 ops/s; RME 0.676%; n=243; retry=0 | 0.249 µs; 4010908 ops/s; RME 0.534%; n=245; retry=0 | 796975.0–826057.4; 820570.3–873432.4; 842009.8–887072.9 |
| field-write-item-watchers | 100 | 0.353 µs; 2833149 ops/s; RME 0.289%; n=173; retry=0 | 0.332 µs; 3007589 ops/s; RME 0.372%; n=184; retry=0 | 0.338 µs; 2955776 ops/s; RME 0.429%; n=181; retry=0 | 30.39–30.72; 33.86–34.79; 32.68–33.20 |
| field-write-item-watchers | 1000 | 0.280 µs; 3574694 ops/s; RME 0.274%; n=219; retry=0 | 0.256 µs; 3905306 ops/s; RME 0.391%; n=954; retry=0 | 0.272 µs; 3672699 ops/s; RME 0.371%; n=225; retry=0 | 38.42–38.90; 42.27–42.91; 39.94–40.55 |
| field-write-item-watchers | 10000 | 0.273 µs; 3663590 ops/s; RME 0.574%; n=224; retry=0 | 0.252 µs; 3965615 ops/s; RME 0.967%; n=243; retry=0 | 0.273 µs; 3667250 ops/s; RME 0.853%; n=224; retry=0 | 38.92–39.65; 42.16–43.47; 40.06–41.12 |
| field-write-list-read | 100 | 0.349 µs; 2868460 ops/s; RME 0.375%; n=176; retry=0 | 0.331 µs; 3019510 ops/s; RME 0.430%; n=185; retry=0 | 0.346 µs; 2891245 ops/s; RME 0.415%; n=177; retry=0 | 100.6–102.3; 108.3–110.5; 109.3–111.6 |
| field-write-list-read | 1000 | 0.557 µs; 1796326 ops/s; RME 1.256%; n=110; retry=0 | 0.552 µs; 1811911 ops/s; RME 1.312%; n=111; retry=0 | 0.573 µs; 1745107 ops/s; RME 1.293%; n=107; retry=0 | 618.7–637.2; 642.9–666.5; 669.1–698.9 |
| field-write-list-read | 10000 | 2.877 µs; 347556 ops/s; RME 1.237%; n=679; retry=1 | 2.807 µs; 356302 ops/s; RME 1.661%; n=174; retry=0 | 2.662 µs; 375674 ops/s; RME 1.575%; n=184; retry=0 | 1404.3–1451.1; 1456.3–1530.2; 1560.8–1632.7 |
| replace-list-watchers | 100 | 28.75 µs; 34785 ops/s; RME 1.451%; n=136; retry=0 | 27.14 µs; 36843 ops/s; RME 0.785%; n=144; retry=0 | 26.50 µs; 37733 ops/s; RME 0.583%; n=148; retry=0 | 122.7–132.2; 128.7–132.3; 133.3–136.3 |
| replace-list-watchers | 1000 | 128.9 µs; 7756 ops/s; RME 1.031%; n=122; retry=0 | 131.2 µs; 7620 ops/s; RME 0.602%; n=120; retry=0 | 129.1 µs; 7748 ops/s; RME 0.626%; n=122; retry=0 | 264.2–279.3; 272.1–278.6; 284.7–295.2 |
| replace-list-watchers | 10000 | 1440.1 µs; 694 ops/s; RME 0.548%; n=174; retry=0 | 1466.4 µs; 682 ops/s; RME 0.543%; n=171; retry=0 | 1347.5 µs; 742 ops/s; RME 0.459%; n=186; retry=0 | 286.6–300.2; 282.1–288.7; 328.0–345.5 |
| layer-field-read | 100 | 2.176 µs; 459636 ops/s; RME 0.453%; n=225; retry=0 | 2.274 µs; 439806 ops/s; RME 0.346%; n=215; retry=0 | 2.258 µs; 442854 ops/s; RME 0.506%; n=109; retry=0 | 4.956–5.031; 4.814–4.900; 4.880–4.996 |
| layer-field-read | 1000 | 23.85 µs; 41924 ops/s; RME 0.400%; n=164; retry=0 | 25.73 µs; 38872 ops/s; RME 0.698%; n=152; retry=0 | 24.00 µs; 41667 ops/s; RME 0.458%; n=163; retry=0 | 4.752–4.862; 4.513–4.652; 4.741–4.830 |
| layer-field-read | 10000 | 252.1 µs; 3967 ops/s; RME 0.420%; n=248; retry=0 | 264.7 µs; 3778 ops/s; RME 0.356%; n=119; retry=0 | 265.0 µs; 3774 ops/s; RME 0.477%; n=472; retry=1 | 4.772–4.894; 4.633–4.717; 4.641–4.797 |
| relation-unrelated-write | 100 | 0.342 µs; 2926099 ops/s; RME 0.396%; n=179; retry=0 | 0.345 µs; 2901906 ops/s; RME 0.781%; n=178; retry=0 | 0.358 µs; 2794765 ops/s; RME 0.703%; n=171; retry=0 | 18.03–18.50; 17.23–17.91; 17.67–18.37 |
| relation-unrelated-write | 1000 | 0.353 µs; 2830836 ops/s; RME 0.497%; n=173; retry=0 | 0.346 µs; 2891997 ops/s; RME 0.538%; n=177; retry=0 | 0.360 µs; 2778174 ops/s; RME 0.463%; n=170; retry=0 | 17.66–18.33; 17.28–17.73; 18.33–19.05 |
| relation-unrelated-write | 10000 | 0.351 µs; 2849893 ops/s; RME 0.358%; n=174; retry=0 | 0.351 µs; 2846760 ops/s; RME 0.716%; n=174; retry=0 | 0.372 µs; 2691237 ops/s; RME 0.799%; n=165; retry=0 | 17.81–18.16; 17.21–17.72; 16.93–17.44 |
| item-read | 100 | 0.049 µs; 20380068 ops/s; RME 0.251%; n=1244; retry=0 | 0.050 µs; 20128563 ops/s; RME 0.325%; n=1229; retry=0 | 0.052 µs; 19190939 ops/s; RME 0.362%; n=1172; retry=0 | 6.615–6.690; 6.827–6.952; 6.774–6.972 |
| item-read | 1000 | 0.058 µs; 17380677 ops/s; RME 0.397%; n=1061; retry=0 | 0.056 µs; 17940736 ops/s; RME 0.393%; n=1096; retry=0 | 0.057 µs; 17533385 ops/s; RME 0.461%; n=1071; retry=0 | 5.835–5.917; 6.171–6.266; 6.164–6.272 |
| item-read | 10000 | 0.060 µs; 16682527 ops/s; RME 0.445%; n=1019; retry=0 | 0.062 µs; 16036760 ops/s; RME 0.902%; n=1958; retry=0 | 0.061 µs; 16279058 ops/s; RME 0.946%; n=3975; retry=0 | 5.749–5.944; 5.892–6.217; 6.564–6.979 |
| composite-index-membership-write | 1000 | 1.861 µs; 537416 ops/s; RME 0.264%; n=132; retry=0 | 1.888 µs; 529582 ops/s; RME 0.476%; n=130; retry=0 | 1.956 µs; 511258 ops/s; RME 0.811%; n=250; retry=0 | 1.590–1.607; 1.579–1.615; 1.538–1.581 |
| list-read | 100 | 0.050 µs; 20016180 ops/s; RME 0.364%; n=1222; retry=0 | 0.053 µs; 18736596 ops/s; RME 0.490%; n=1144; retry=0 | 0.043 µs; 22997174 ops/s; RME 0.401%; n=1404; retry=1 | 766.6–775.5; 716.1–728.3; 754.4–765.9 |
| list-read | 1000 | 0.215 µs; 4652512 ops/s; RME 1.365%; n=284; retry=0 | 0.205 µs; 4875476 ops/s; RME 1.383%; n=298; retry=0 | 0.257 µs; 3889183 ops/s; RME 1.675%; n=953; retry=1 | 1823.8–1902.2; 1861.5–1925.7; 1502.3–1563.4 |
| list-read | 10000 | 2.131 µs; 469282 ops/s; RME 0.650%; n=3667; retry=0 | 2.086 µs; 479344 ops/s; RME 1.513%; n=118; retry=0 | 2.284 µs; 437792 ops/s; RME 1.377%; n=428; retry=1 | 2132.0–2197.2; 2066.4–2174.4; 1945.4–2019.2 |
| filtered-list-read | 100 | 3.902 µs; 256249 ops/s; RME 0.413%; n=126; retry=0 | 4.156 µs; 240637 ops/s; RME 0.215%; n=118; retry=0 | 4.184 µs; 239014 ops/s; RME 1.729%; n=117; retry=0 | 5.778–5.885; 5.329–5.383; 5.383–5.675 |
| filtered-list-read | 1000 | 3.824 µs; 261525 ops/s; RME 0.382%; n=128; retry=0 | 4.402 µs; 227147 ops/s; RME 0.573%; n=111; retry=0 | 3.944 µs; 253552 ops/s; RME 0.200%; n=124; retry=0 | 36.04–36.67; 30.73–31.20; 34.64–34.94 |
| filtered-list-read | 10000 | 3.840 µs; 260394 ops/s; RME 0.353%; n=128; retry=0 | 3.864 µs; 258810 ops/s; RME 0.503%; n=127; retry=0 | 3.912 µs; 255617 ops/s; RME 0.295%; n=250; retry=0 | 480.7–495.5; 455.4–469.6; 477.0–494.7 |
| indexed-list-read | 100 | 0.110 µs; 9104117 ops/s; RME 0.355%; n=556; retry=0 | 0.112 µs; 8956999 ops/s; RME 0.367%; n=547; retry=0 | 0.111 µs; 9041656 ops/s; RME 0.404%; n=552; retry=0 | 33.96–35.14; 33.85–34.42; 35.48–36.52 |
| indexed-list-read | 1000 | 0.121 µs; 8240638 ops/s; RME 0.512%; n=503; retry=0 | 0.124 µs; 8037448 ops/s; RME 0.488%; n=491; retry=0 | 0.122 µs; 8208890 ops/s; RME 0.264%; n=502; retry=0 | 232.2–235.6; 231.4–241.6; 234.3–242.0 |
| indexed-list-read | 10000 | 0.316 µs; 3168944 ops/s; RME 1.192%; n=194; retry=0 | 0.313 µs; 3197261 ops/s; RME 1.748%; n=196; retry=0 | 0.324 µs; 3083096 ops/s; RME 1.722%; n=189; retry=0 | 878.0–903.7; 891.4–930.7; 882.3–930.9 |
| batch-write | 100 | 15.71 µs; 63658 ops/s; RME 0.262%; n=125; retry=0 | 16.54 µs; 60463 ops/s; RME 0.543%; n=119; retry=0 | 16.41 µs; 60926 ops/s; RME 1.066%; n=120; retry=0 | 4.845–4.893; 4.625–4.702; 4.767–4.926 |
| batch-write | 1000 | 16.09 µs; 62132 ops/s; RME 0.431%; n=122; retry=0 | 16.74 µs; 59732 ops/s; RME 0.666%; n=117; retry=0 | 16.43 µs; 60867 ops/s; RME 1.007%; n=119; retry=0 | 4.794–4.883; 4.595–4.695; 4.757–4.901 |
| batch-write | 10000 | 16.33 µs; 61219 ops/s; RME 1.410%; n=120; retry=0 | 17.79 µs; 56202 ops/s; RME 1.020%; n=110; retry=0 | 16.86 µs; 59297 ops/s; RME 1.302%; n=116; retry=0 | 4.709–4.890; 4.362–4.494; 4.613–4.773 |
| paused-write-batch | 100 | 4.667 µs; 214277 ops/s; RME 0.408%; n=210; retry=0 | 4.869 µs; 205371 ops/s; RME 0.431%; n=201; retry=0 | 5.117 µs; 195436 ops/s; RME 0.525%; n=191; retry=0 | 3.336–3.379; 3.240–3.297; 3.157–3.240 |
| paused-write-batch | 1000 | 4.746 µs; 210698 ops/s; RME 0.616%; n=103; retry=0 | 4.936 µs; 202613 ops/s; RME 0.674%; n=198; retry=0 | 5.073 µs; 197132 ops/s; RME 0.544%; n=193; retry=0 | 3.327–3.400; 3.190–3.265; 3.146–3.205 |
| paused-write-batch | 10000 | 4.865 µs; 205530 ops/s; RME 0.658%; n=101; retry=0 | 5.218 µs; 191629 ops/s; RME 0.520%; n=188; retry=0 | 5.389 µs; 185579 ops/s; RME 0.684%; n=182; retry=0 | 3.278–3.345; 3.085–3.143; 3.064–3.143 |
| relation-membership-write | 100 | 1.494 µs; 669420 ops/s; RME 0.652%; n=164; retry=0 | 1.513 µs; 661018 ops/s; RME 0.495%; n=162; retry=0 | 1.574 µs; 635299 ops/s; RME 1.439%; n=156; retry=0 | 4.312–4.472; 4.277–4.430; 4.289–4.621 |
| relation-membership-write | 1000 | 1.746 µs; 572867 ops/s; RME 0.537%; n=140; retry=0 | 1.806 µs; 553678 ops/s; RME 0.443%; n=136; retry=0 | 1.807 µs; 553527 ops/s; RME 0.471%; n=136; retry=0 | 4.042–4.206; 3.894–4.051; 3.976–4.123 |
| relation-membership-write | 10000 | 8.561 µs; 116808 ops/s; RME 2.988%; n=914; retry=2 | 8.591 µs; 116396 ops/s; RME 2.995%; n=910; retry=2 | 8.582 µs; 116517 ops/s; RME 3.000%; n=911; retry=2 | 2.266–2.544; 2.272–2.552; 2.266–2.546 |
| relation-related-field-write | 1000 | 0.361 µs; 2766536 ops/s; RME 0.255%; n=169; retry=0 | 0.353 µs; 2834346 ops/s; RME 0.402%; n=173; retry=0 | 0.387 µs; 2581376 ops/s; RME 0.938%; n=158; retry=0 | 31.60–32.08; 32.88–33.59; 29.82–31.32 |
| composite-index-read | 100 | 0.166 µs; 6019769 ops/s; RME 0.372%; n=368; retry=0 | 0.192 µs; 5212717 ops/s; RME 0.508%; n=319; retry=0 | 0.193 µs; 5173808 ops/s; RME 1.721%; n=316; retry=0 | 22.21–22.81; 19.95–20.67; 20.57–22.20 |
| composite-index-read | 1000 | 0.184 µs; 5439260 ops/s; RME 0.354%; n=332; retry=0 | 0.197 µs; 5068225 ops/s; RME 0.611%; n=310; retry=0 | 0.201 µs; 4985910 ops/s; RME 2.682%; n=305; retry=0 | 154.0–156.2; 143.3–146.3; 141.2–150.9 |
| composite-index-read | 10000 | 0.372 µs; 2684792 ops/s; RME 1.528%; n=164; retry=0 | 0.440 µs; 2270712 ops/s; RME 2.403%; n=139; retry=0 | 0.363 µs; 2757512 ops/s; RME 0.590%; n=674; retry=1 | 741.9–770.6; 614.0–650.8; 766.8–784.6 |
| crdt-fresh-write | 1000 | 0.552 µs; 1810684 ops/s; RME 0.639%; n=111; retry=0 | 0.527 µs; 1897120 ops/s; RME 0.695%; n=116; retry=0 | 0.534 µs; 1873981 ops/s; RME 0.493%; n=115; retry=0 | 1.941–1.987; 2.041–2.087; 1.992–2.024 |
| crdt-stale-write | 1000 | 0.386 µs; 2592632 ops/s; RME 0.661%; n=159; retry=0 | 0.354 µs; 2821166 ops/s; RME 0.687%; n=173; retry=0 | 0.368 µs; 2713865 ops/s; RME 0.133%; n=166; retry=0 | 2.079–2.135; 2.307–2.385; 2.129–2.147 |
| nested-relation-write | 1000 | 5.574 µs; 179412 ops/s; RME 0.537%; n=176; retry=0 | 6.272 µs; 159431 ops/s; RME 1.319%; n=312; retry=0 | 5.603 µs; 178473 ops/s; RME 0.364%; n=175; retry=0 | 1.940–1.981; 1.827–1.911; 1.937–1.963 |
| layer-cycle | 100 | 2.836 µs; 352660 ops/s; RME 1.448%; n=689; retry=1 | 2.733 µs; 365853 ops/s; RME 1.439%; n=715; retry=1 | 2.814 µs; 355327 ops/s; RME 1.508%; n=695; retry=1 | 10.42–10.81; 11.23–11.83; 10.55–10.96 |
| layer-cycle | 1000 | 2.764 µs; 361816 ops/s; RME 2.579%; n=177; retry=0 | 2.787 µs; 358851 ops/s; RME 1.430%; n=701; retry=1 | 2.715 µs; 368376 ops/s; RME 2.945%; n=180; retry=0 | 94.63–102.4; 97.22–100.9; 95.94–102.5 |
| layer-cycle | 10000 | 2.832 µs; 353140 ops/s; RME 2.503%; n=173; retry=0 | 3.016 µs; 331543 ops/s; RME 2.814%; n=162; retry=0 | 2.703 µs; 370021 ops/s; RME 2.776%; n=181; retry=0 | 1114.1–1196.8; 1030.1–1116.5; 1150.5–1246.4 |
| serialize-state | 100 | 2.244 µs; 445708 ops/s; RME 0.728%; n=109; retry=0 | 2.159 µs; 463171 ops/s; RME 0.447%; n=114; retry=0 | 2.195 µs; 455553 ops/s; RME 0.666%; n=112; retry=0 | 11.07–11.30; 11.68–11.84; 11.42–11.71 |
| serialize-state | 1000 | 16.36 µs; 61124 ops/s; RME 0.696%; n=120; retry=0 | 16.32 µs; 61284 ops/s; RME 0.850%; n=120; retry=0 | 17.15 µs; 58293 ops/s; RME 1.149%; n=228; retry=0 | 14.84–15.16; 15.14–15.48; 13.83–14.23 |
| serialize-state | 10000 | 155.6 µs; 6427 ops/s; RME 0.635%; n=201; retry=0 | 144.9 µs; 6901 ops/s; RME 1.029%; n=108; retry=0 | 151.5 µs; 6599 ops/s; RME 0.998%; n=104; retry=0 | 19.42–20.10; 20.47–21.29; 19.28–20.08 |
| hydrate-state | 100 | 12.10 µs; 82655 ops/s; RME 2.111%; n=162; retry=0 | 11.33 µs; 88225 ops/s; RME 2.110%; n=173; retry=0 | 11.05 µs; 90516 ops/s; RME 0.938%; n=708; retry=1 | 4.340–4.717; 4.641–5.038; 4.759–4.941 |
| hydrate-state | 1000 | 87.64 µs; 11410 ops/s; RME 2.027%; n=179; retry=0 | 85.68 µs; 11672 ops/s; RME 2.190%; n=183; retry=0 | 88.15 µs; 11345 ops/s; RME 1.927%; n=178; retry=0 | 5.914–6.520; 5.953–6.517; 5.827–6.383 |
| hydrate-state | 10000 | 1247.9 µs; 801 ops/s; RME 2.552%; n=403; retry=1 | 1248.5 µs; 801 ops/s; RME 2.576%; n=401; retry=1 | 1252.4 µs; 798 ops/s; RME 2.568%; n=400; retry=1 | 4.105–4.395; 4.088–4.389; 4.133–4.430 |
| composite-write-no-watcher | 1000 | 0.867 µs; 1153176 ops/s; RME 0.695%; n=141; retry=0 | 0.850 µs; 1175846 ops/s; RME 0.232%; n=144; retry=0 | 0.894 µs; 1119029 ops/s; RME 0.244%; n=137; retry=0 | 2.503–2.563; 2.506–2.531; 2.412–2.445 |
| composite-write-direct-watcher | 1000 | 1.781 µs; 561374 ops/s; RME 0.455%; n=138; retry=0 | 1.709 µs; 585161 ops/s; RME 0.348%; n=143; retry=0 | 1.730 µs; 577979 ops/s; RME 0.287%; n=142; retry=0 | 1.375–1.400; 1.395–1.413; 1.385–1.402 |
| scalar-write-direct-watcher | 1000 | 1.686 µs; 592995 ops/s; RME 0.555%; n=145; retry=0 | 1.641 µs; 609513 ops/s; RME 0.460%; n=149; retry=0 | 1.669 µs; 599130 ops/s; RME 0.463%; n=147; retry=0 | 3.397–3.588; 3.473–3.600; 3.431–3.557 |

## Residual interpretation

- Rows missing direct v4 CPU target: none.
- Legacy acceptance failures: none.
- Clear v5 regressions versus v4: none.

Detailed means, throughput, RME, samples, batch sizes, retries, reactive counts, and intervals remain in companion JSON.
