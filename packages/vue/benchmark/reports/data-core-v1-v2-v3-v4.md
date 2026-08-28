# Data Core v1/v2/v3/v4 performance report

Generated: 2026-08-28T07:50:09.012Z

## Environment and versions

- CPU: AMD Ryzen 9 9950X 16-Core Processor
- OS: Linux 7.1.8-200.fc44.x86_64 x64
- Node: v23.9.0
- pnpm: 10.20.0
- Legacy: packages/vue/benchmark/legacy-cache.ts
- Data Core v1: 30318e8cae55ae623b112865c8ae04c4c6d43242
- Data Core v2: ffdc11cab53301233881c0512ac5139118779ca9
- Data Core v3: 98cc5a7fb6b48f92d3eff4d0b54f23fdd4bf701c
- Data Core v4: uncommitted working tree based on d10f007ac398840a786acf318983d6b3f3ee50e5
- Candidate diff SHA-256: 19c9fa67749d53883052a8478dd1b8c7f412d18b7d1d2048120611db499b2114

## Acceptance summary

- Run 1: 59/59 engine faster, 0 legacy faster, 0 no clear difference, 0 noisy; max RME 2.371%; retries 5.
- Run 2: 59/59 engine faster, 0 legacy faster, 0 no clear difference, 0 noisy; max RME 2.979%; retries 4.
- Run 3: 59/59 engine faster, 0 legacy faster, 0 no clear difference, 0 noisy; max RME 2.974%; retries 3.
- Typical v4 throughput gain versus v3: 71.3% faster.
- Typical v4 throughput gain versus v2: 122.3% faster.
- Typical v4 throughput gain versus v1: 182.8% faster.
- Clear v4 regressions versus v3: 0.
- Clear v4 regressions versus v2: 0.
- Clear v4 regressions versus v1: 0.
- Cache bounds: 128 index results, 20000 wrapper references, 256 orphan signals.

## How to read comparisons

- Each Data Core version is first compared with legacy measured beside it, then versions are compared. This reduces machine and run drift.
- Version cells show typical throughput change, followed by conservative plausible range including run variation and measurement uncertainty.
- `faster` means v4 completes more operations per second. `slower` means fewer operations per second.
- If plausible range includes both faster and slower outcomes, result says `unclear`.
- RME is benchmark uncertainty. Lower is better; configured limit is 3%.
- Companion JSON retains exact ratios and confidence values for automated analysis.

## All 59 benchmark rows

| Scenario | Items | Legacy µs | v1 µs | v2 µs | v3 µs | v4 µs | v4 vs legacy across runs | v4 vs v3 | v4 vs v2 | v4 vs v1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| field write / list watchers | 100 | 1683.3 | 0.599 | 0.738 | 0.329 | 0.244 | 6903.6–7110.5× faster | 35.6% faster; plausible 30.2–47.6% faster | 200% faster; plausible 189.2–214.9% faster | 126.4% faster; plausible 115.9–148.9% faster |
| field write / list watchers | 1000 | 17076.7 | 0.601 | 0.807 | 0.340 | 0.246 | 67892.9–76775.0× faster | 36.9% faster; plausible 29.4–57.8% faster | 198.7% faster; plausible 176–260.4% faster | 109.6% faster; plausible 93.9–164.3% faster |
| field write / list watchers | 10000 | 211911.4 | 0.725 | 1.119 | 0.397 | 0.274 | 753314.1–807344.5× faster | 52.1% faster; plausible 32.3–62.5% faster | 274% faster; plausible 198.2–313.3% faster | 140.2% faster; plausible 100.1–172.5% faster |
| field write / item watchers | 100 | 11.38 | 0.878 | 0.795 | 0.509 | 0.367 | 30.88–31.93× faster | 32.8% faster; plausible 24.5–45.1% faster | 107.2% faster; plausible 89.9–127.6% faster | 115.8% faster; plausible 105.5–145% faster |
| field write / item watchers | 1000 | 11.27 | 0.691 | 0.745 | 0.407 | 0.277 | 39.55–41.48× faster | 43.2% faster; plausible 35.9–54.9% faster | 154.5% faster; plausible 124.4–172.6% faster | 126.1% faster; plausible 113.6–148.8% faster |
| field write / item watchers | 10000 | 11.11 | 0.723 | 0.900 | 0.398 | 0.290 | 36.86–39.27× faster | 36.2% faster; plausible 21.8–45.4% faster | 182% faster; plausible 148.9–210.4% faster | 124.9% faster; plausible 100.9–146.8% faster |
| field write + imperative list read | 100 | 36.77 | 0.835 | 0.923 | 0.510 | 0.373 | 95.53–109.9× faster | 34.6% faster; plausible 19.6–58.5% faster | 134% faster; plausible 120.5–200.7% faster | 100.3% faster; plausible 90–142.1% faster |
| field write + imperative list read | 1000 | 364.4 | 1.252 | 1.418 | 0.735 | 0.623 | 571.8–651.9× faster | 33.9% faster; plausible 2.04–55.4% faster | 141.4% faster; plausible 98.9–164.1% faster | 103.3% faster; plausible 70.4–130.8% faster |
| field write + imperative list read | 10000 | 4306.8 | 4.414 | 4.853 | 3.005 | 2.823 | 1477.0–1568.3× faster | 10.8% faster; unclear (1.4% slower to 24.1% faster) | 70.5% faster; plausible 31.9–99.6% faster | 49.4% faster; plausible 15.8–65.4% faster |
| replace / list watchers | 100 | 3504.7 | 36.69 | 35.42 | 30.49 | 27.47 | 125.8–134.0× faster | 13.2% faster; plausible 6.19–28.3% faster | 20.1% faster; plausible 8.36–31.7% faster | 20.5% faster; plausible 10.6–30.3% faster |
| replace / list watchers | 1000 | 36314.6 | 197.4 | 162.0 | 161.4 | 130.4 | 264.6–290.3× faster | 11.7% faster; plausible 6.38–35.8% faster | 14.5% faster; plausible 0.23–30.5% faster | 27.9% faster; plausible 21.4–58.4% faster |
| replace / list watchers | 10000 | 429871.0 | 2085.6 | 1852.4 | 1769.7 | 1464.7 | 292.2–307.9× faster | 16.1% faster; plausible 9.82–29.6% faster | 15.4% faster; plausible 0.85–33.2% faster | 23.5% faster; unclear (2.5% slower to 46.3% faster) |
| read fields / 5 optimistic layers | 100 | 12.12 | 24.11 | 3.160 | 3.314 | 2.931 | 3.890–4.296× faster | 7.16% faster; unclear (2.24% slower to 40.9% faster) | 3.25% faster; unclear (7.32% slower to 10.6% faster) | 610.5% faster; plausible 538.5–660% faster |
| read fields / 5 optimistic layers | 1000 | 126.3 | 256.7 | 33.09 | 39.03 | 31.27 | 3.201–4.120× faster | 22.2% faster; unclear (12% slower to 36.5% faster) | 1.2% faster; unclear (21.1% slower to 16.6% faster) | 580.4% faster; plausible 414.9–655.1% faster |
| read fields / 5 optimistic layers | 10000 | 1380.3 | 2989.7 | 422.2 | 437.2 | 357.7 | 2.831–4.384× faster | 11.5% faster; unclear (20.6% slower to 49.1% faster) | 3.97% faster; unclear (27.6% slower to 30.7% faster) | 588.7% faster; plausible 383.6–990.8% faster |
| relation read / unrelated writes | 100 | 6.376 | 0.894 | 0.831 | 0.483 | 0.372 | 16.75–17.87× faster | 26.4% faster; plausible 18–49.5% faster | 114.5% faster; plausible 103.3–143.8% faster | 118.3% faster; plausible 105.9–145.7% faster |
| relation read / unrelated writes | 1000 | 6.275 | 0.945 | 0.891 | 0.498 | 0.403 | 14.54–16.40× faster | 21.3% faster; plausible 1.89–35.8% faster | 128.3% faster; plausible 89.3–146.8% faster | 119% faster; plausible 74.4–136.1% faster |
| relation read / unrelated writes | 10000 | 6.272 | 1.010 | 0.953 | 0.572 | 0.417 | 14.48–16.00× faster | 22.8% faster; plausible 10.5–47.4% faster | 129.4% faster; plausible 101.1–159.3% faster | 120.8% faster; plausible 105.6–156.3% faster |
| read item | 100 | 0.348 | 0.425 | 0.113 | 0.082 | 0.065 | 5.284–5.414× faster | 13.9% faster; plausible 3.76–18.2% faster | 59.9% faster; plausible 47.9–97.2% faster | 428% faster; plausible 404.3–521.8% faster |
| read item | 1000 | 0.357 | 0.428 | 0.138 | 0.094 | 0.078 | 4.570–4.675× faster | 6.4% faster; plausible 1.94–14.6% faster | 50.3% faster; plausible 38–82.5% faster | 393% faster; plausible 357–414% faster |
| read item | 10000 | 0.389 | 0.623 | 0.143 | 0.101 | 0.092 | 3.803–4.495× faster | 11.5% slower; unclear (26.5% slower to 3.97% faster) | 35.3% faster; plausible 3.46–64.8% faster | 496.8% faster; plausible 324.3–671.3% faster |
| composite index membership write | 1000 | 3.004 | 5.203 | 2.588 | 2.349 | 1.930 | 1.527–1.582× faster | 19.2% faster; plausible 13.5–24.4% faster | 33.1% faster; plausible 26.6–37.2% faster | 140.1% faster; plausible 121.3–170.3% faster |
| read full list | 100 | 38.37 | 0.107 | 0.062 | 0.057 | 0.053 | 717.7–783.6× faster | 5.73% faster; unclear (1.02% slower to 21.2% faster) | 14.9% faster; plausible 5.14–29.9% faster | 88.8% faster; plausible 72.1–132.1% faster |
| read full list | 1000 | 390.4 | 0.316 | 0.255 | 0.241 | 0.211 | 1405.8–1999.6× faster | 6.86% faster; unclear (27.6% slower to 28.8% faster) | 10.7% faster; unclear (20.6% slower to 35.2% faster) | 37.5% faster; unclear (6.93% slower to 208.1% faster) |
| read full list | 10000 | 4648.3 | 2.556 | 2.611 | 2.384 | 2.546 | 1825.4–2051.6× faster | 4.38% slower; unclear (18.4% slower to 7.75% faster) | 12.7% faster; unclear (8.11% slower to 19.3% faster) | 8.74% faster; unclear (7.12% slower to 72.5% faster) |
| read filtered limited list | 100 | 22.67 | 16.51 | 5.598 | 5.670 | 4.399 | 5.135–5.380× faster | 28.3% faster; plausible 17.9–35.7% faster | 27.1% faster; plausible 14.7–38% faster | 267.4% faster; plausible 249.4–287.7% faster |
| read filtered limited list | 1000 | 141.4 | 17.32 | 5.608 | 5.729 | 4.285 | 32.76–34.20× faster | 34.7% faster; plausible 29.8–63.7% faster | 31.3% faster; plausible 27.8–41.6% faster | 299.6% faster; plausible 279.2–333.9% faster |
| read filtered limited list | 10000 | 1863.3 | 20.34 | 8.142 | 7.783 | 4.375 | 395.6–429.1× faster | 78.1% faster; plausible 58–101% faster | 81.7% faster; plausible 61–104.3% faster | 342.2% faster; plausible 287.9–402.4% faster |
| read indexed list | 100 | 3.912 | 1.456 | 0.865 | 0.861 | 0.147 | 26.19–27.15× faster | 478.7% faster; plausible 431.6–530.5% faster | 477.4% faster; plausible 426.8–523.1% faster | 859.7% faster; plausible 785.6–925.2% faster |
| read indexed list | 1000 | 29.00 | 10.05 | 6.622 | 6.628 | 0.168 | 155.7–174.6× faster | 3734.5% faster; plausible 3296.9–4254.8% faster | 3675.9% faster; plausible 3275.5–4080.3% faster | 5399% faster; plausible 4722.7–5872.8% faster |
| read indexed list | 10000 | 284.0 | 92.74 | 62.74 | 61.53 | 0.363 | 726.6–833.1× faster | 16579.3% faster; plausible 14649–18495.6% faster | 17179.1% faster; plausible 15379–19185.8% faster | 22900.1% faster; plausible 20521.5–27341.7% faster |
| write 100-item batch | 100 | 78.30 | 35.76 | 48.89 | 26.53 | 17.53 | 4.291–4.675× faster | 51.8% faster; plausible 33.7–65.9% faster | 179.6% faster; plausible 160.4–211.2% faster | 99.2% faster; plausible 84.6–115.9% faster |
| write 100-item batch | 1000 | 78.95 | 37.35 | 50.71 | 26.58 | 18.19 | 4.199–4.636× faster | 44% faster; plausible 33.8–73.7% faster | 182.1% faster; plausible 161.8–211.7% faster | 100% faster; plausible 84–123.9% faster |
| write 100-item batch | 10000 | 79.31 | 42.62 | 55.28 | 27.89 | 17.92 | 4.356–4.563× faster | 46.5% faster; plausible 35.8–69.8% faster | 191.5% faster; plausible 172.6–220% faster | 118.1% faster; plausible 95.6–150.7% faster |
| pause / 20 writes / resume | 100 | 16.05 | 8.133 | 10.98 | 6.125 | 4.770 | 3.183–3.480× faster | 29.3% faster; plausible 19.1–37.2% faster | 125.2% faster; plausible 106.2–146.1% faster | 71.4% faster; plausible 54.4–82.5% faster |
| pause / 20 writes / resume | 1000 | 16.49 | 8.630 | 11.40 | 6.508 | 4.981 | 3.161–3.312× faster | 26.5% faster; plausible 15.1–39.9% faster | 132% faster; plausible 114.7–157.1% faster | 69.2% faster; plausible 55.7–77.7% faster |
| pause / 20 writes / resume | 10000 | 16.71 | 10.06 | 12.35 | 6.580 | 5.161 | 3.106–3.238× faster | 24.1% faster; plausible 9–35.9% faster | 129.6% faster; plausible 112.5–148.2% faster | 78.9% faster; plausible 58.2–91.3% faster |
| relation membership write | 100 | 6.743 | 3.730 | 2.127 | 1.975 | 1.517 | 4.309–4.472× faster | 26.8% faster; plausible 17.8–34.6% faster | 38.6% faster; plausible 19–45.8% faster | 132.3% faster; plausible 105.4–144.4% faster |
| relation membership write | 1000 | 7.314 | 3.954 | 2.489 | 2.269 | 1.806 | 4.011–4.084× faster | 23.5% faster; plausible 13.6–32.3% faster | 33.8% faster; plausible 24.6–44.2% faster | 108.3% faster; plausible 94–141.5% faster |
| relation membership write | 10000 | 20.82 | 10.90 | 9.394 | 9.240 | 8.625 | 2.376–2.414× faster | 6.48% faster; unclear (6.42% slower to 22.3% faster) | 6.84% faster; unclear (6.05% slower to 21.3% faster) | 28.4% faster; plausible 2.48–66.1% faster |
| relation read / related field writes | 1000 | 11.77 | 0.943 | 0.910 | 0.492 | 0.392 | 29.86–31.47× faster | 22.6% faster; plausible 16.7–34.9% faster | 116.9% faster; plausible 106.9–136.7% faster | 106.4% faster; plausible 84.3–137.7% faster |
| read composite index | 100 | 3.827 | 1.590 | 1.009 | 0.982 | 0.215 | 16.15–19.91× faster | 353.9% faster; plausible 284.3–445.9% faster | 341.8% faster; plausible 289.7–437.4% faster | 521.8% faster; plausible 438.2–657.5% faster |
| read composite index | 1000 | 28.03 | 10.97 | 7.009 | 6.912 | 0.252 | 110.9–111.5× faster | 2540.6% faster; plausible 2439.5–2758.3% faster | 2556.3% faster; plausible 2375.3–2677.6% faster | 3417.8% faster; plausible 3232.6–3716% faster |
| read composite index | 10000 | 278.1 | 95.41 | 64.02 | 62.57 | 0.423 | 608.7–692.5× faster | 14012.9% faster; plausible 12679.5–15775.6% faster | 13479.5% faster; plausible 11978.8–16135.6% faster | 20145% faster; plausible 17141.2–22414.9% faster |
| accepted CRDT field write | 1000 | 1.080 | 1.003 | 1.141 | 0.771 | 0.543 | 1.853–1.989× faster | 27.7% faster; plausible 16.8–36.7% faster | 93.1% faster; plausible 61.2–104.9% faster | 62.4% faster; plausible 29.1–71.7% faster |
| rejected stale CRDT field write | 1000 | 0.808 | 1.032 | 1.090 | 0.547 | 0.391 | 2.034–2.100× faster | 26% faster; plausible 19.6–44.1% faster | 92.4% faster; plausible 77.1–118.1% faster | 69.9% faster; plausible 59.9–76.6% faster |
| write parent + 10 nested children | 1000 | 11.22 | 9.074 | 6.969 | 6.424 | 5.987 | 1.694–1.892× faster | 6.04% faster; unclear (12.6% slower to 12.5% faster) | 14.4% faster; unclear (0.36% slower to 18.7% faster) | 49.3% faster; plausible 27.1–54.4% faster |
| optimistic layer cycle | 100 | 30.86 | 3.840 | 3.539 | 3.518 | 3.153 | 8.891–10.13× faster | 10.3% faster; unclear (9.17% slower to 27.7% faster) | 8.38% faster; unclear (7.64% slower to 25.1% faster) | 13.4% faster; unclear (0.05% slower to 38.8% faster) |
| optimistic layer cycle | 1000 | 270.0 | 3.972 | 3.471 | 3.330 | 3.227 | 79.47–88.73× faster | 6.34% faster; unclear (8.5% slower to 16.1% faster) | 6.85% faster; unclear (6.96% slower to 24.9% faster) | 17.3% faster; unclear (2.59% slower to 28.9% faster) |
| optimistic layer cycle | 10000 | 3224.9 | 3.934 | 3.694 | 3.530 | 3.169 | 997.7–1074.0× faster | 10.4% faster; unclear (1.24% slower to 192% faster) | 11.2% faster; unclear (4.16% slower to 29% faster) | 7.38% faster; unclear (6.35% slower to 28.9% faster) |
| serialize cache state | 100 | 25.12 | 2.380 | 2.409 | 2.233 | 2.198 | 11.39–12.81× faster | 0.29% faster; unclear (3.09% slower to 17.9% faster) | 4.85% faster; unclear (4.19% slower to 22.6% faster) | 0.74% faster; unclear (5.38% slower to 26.8% faster) |
| serialize cache state | 1000 | 242.9 | 19.64 | 17.50 | 16.34 | 16.16 | 14.61–16.68× faster | 2.53% faster; unclear (6.74% slower to 22.1% faster) | 5.13% faster; unclear (8.4% slower to 18.4% faster) | 7.6% faster; unclear (3.16% slower to 34.3% faster) |
| serialize cache state | 10000 | 3028.8 | 159.4 | 153.3 | 147.5 | 137.5 | 21.39–23.30× faster | 5.36% faster; unclear (0.71% slower to 17.3% faster) | 3.52% faster; unclear (3.21% slower to 28.5% faster) | 11% faster; plausible 3.99–26.3% faster |
| hydrate cache state | 100 | 56.79 | 25.13 | 31.79 | 26.00 | 13.61 | 3.963–4.281× faster | 93.5% faster; plausible 54.7–115.5% faster | 125.4% faster; plausible 94.3–194.5% faster | 83.3% faster; plausible 51.8–105.6% faster |
| hydrate cache state | 1000 | 556.7 | 201.4 | 251.8 | 208.2 | 100.6 | 5.414–5.618× faster | 105.9% faster; plausible 78.7–129.4% faster | 152.3% faster; plausible 122.9–182.1% faster | 98.9% faster; plausible 72–125% faster |
| hydrate cache state | 10000 | 5487.3 | 2793.4 | 3562.4 | 2942.5 | 1560.8 | 3.492–3.692× faster | 84.1% faster; plausible 68.1–119.2% faster | 126.4% faster; plausible 108.4–173.4% faster | 81.1% faster; plausible 57.7–119.1% faster |
| composite membership write / no watcher | 1000 | 2.179 | 2.093 | 1.462 | 0.973 | 0.889 | 2.430–2.509× faster | 9.27% faster; plausible 5.79–14.2% faster | 61.5% faster; plausible 54.4–70.2% faster | 140.2% faster; plausible 130–155.7% faster |
| composite membership write / direct watcher | 1000 | 2.432 | 3.780 | 2.427 | 2.246 | 1.780 | 1.357–1.388× faster | 23.3% faster; plausible 9.24–28.9% faster | 34.8% faster; plausible 26.1–39.4% faster | 114.1% faster; plausible 105.9–121.9% faster |
| scalar membership write / direct watcher | 1000 | 6.121 | 2.979 | 2.276 | 2.133 | 1.701 | 3.527–3.605× faster | 24.9% faster; plausible 15.5–33.5% faster | 33.9% faster; plausible 23–44.4% faster | 66.4% faster; plausible 54.4–87.4% faster |

## Data Core v4 per-run evidence

| Scenario | Items | Run 1 | Run 2 | Run 3 | Paired legacy intervals |
|---|---:|---|---|---|---|
| field-write-list-watchers | 100 | 0.258 µs; 3873343 ops/s; RME 0.670%; n=237; retry=0 | 0.244 µs; 4101115 ops/s; RME 0.413%; n=251; retry=0 | 0.237 µs; 4226050 ops/s; RME 0.344%; n=258; retry=0 | 6869.7–7032.4; 6836.9–6970.8; 7037.0–7184.5 |
| field-write-list-watchers | 1000 | 0.246 µs; 4065410 ops/s; RME 0.387%; n=249; retry=0 | 0.252 µs; 3975775 ops/s; RME 0.761%; n=243; retry=0 | 0.242 µs; 4140612 ops/s; RME 0.284%; n=253; retry=0 | 75530.3–78029.3; 67077.4–68720.9; 68850.3–69525.6 |
| field-write-list-watchers | 10000 | 0.274 µs; 3648365 ops/s; RME 0.715%; n=223; retry=0 | 0.266 µs; 3766124 ops/s; RME 0.648%; n=231; retry=0 | 0.281 µs; 3560849 ops/s; RME 0.891%; n=218; retry=0 | 794077.9–820802.0; 774733.8–821739.8; 729299.3–777760.7 |
| field-write-item-watchers | 100 | 0.369 µs; 2712630 ops/s; RME 1.071%; n=166; retry=0 | 0.348 µs; 2870754 ops/s; RME 0.406%; n=176; retry=0 | 0.367 µs; 2722203 ops/s; RME 0.735%; n=167; retry=0 | 30.31–31.46; 31.63–32.24; 30.72–31.60 |
| field-write-item-watchers | 1000 | 0.274 µs; 3652284 ops/s; RME 0.361%; n=223; retry=0 | 0.277 µs; 3611174 ops/s; RME 0.580%; n=221; retry=0 | 0.282 µs; 3549086 ops/s; RME 0.356%; n=217; retry=0 | 40.94–42.02; 39.13–39.96; 39.41–40.60 |
| field-write-item-watchers | 10000 | 0.281 µs; 3560450 ops/s; RME 1.014%; n=218; retry=0 | 0.290 µs; 3447925 ops/s; RME 0.625%; n=211; retry=0 | 0.301 µs; 3318208 ops/s; RME 0.819%; n=203; retry=0 | 38.69–39.86; 38.11–38.97; 36.32–37.40 |
| field-write-list-read | 100 | 0.359 µs; 2782327 ops/s; RME 0.706%; n=170; retry=0 | 0.376 µs; 2658256 ops/s; RME 0.714%; n=163; retry=0 | 0.373 µs; 2684561 ops/s; RME 0.798%; n=164; retry=0 | 108.4–111.5; 96.68–98.81; 94.40–96.68 |
| field-write-list-read | 1000 | 0.623 µs; 1604521 ops/s; RME 1.548%; n=98; retry=0 | 0.559 µs; 1789042 ops/s; RME 0.834%; n=219; retry=0 | 0.634 µs; 1577411 ops/s; RME 1.817%; n=193; retry=0 | 622.2–648.0; 644.6–659.3; 558.0–586.0 |
| field-write-list-read | 10000 | 2.883 µs; 346860 ops/s; RME 1.614%; n=170; retry=0 | 2.823 µs; 354175 ops/s; RME 1.626%; n=174; retry=0 | 2.746 µs; 364156 ops/s; RME 1.395%; n=178; retry=0 | 1496.0–1590.4; 1444.2–1510.8; 1524.8–1613.1 |
| replace-list-watchers | 100 | 27.47 µs; 36398 ops/s; RME 0.491%; n=143; retry=0 | 27.86 µs; 35891 ops/s; RME 1.587%; n=141; retry=0 | 27.15 µs; 36833 ops/s; RME 1.628%; n=144; retry=0 | 132.2–135.8; 123.1–128.6; 125.4–132.1 |
| replace-list-watchers | 1000 | 130.4 µs; 7670 ops/s; RME 0.469%; n=120; retry=0 | 130.1 µs; 7689 ops/s; RME 0.837%; n=121; retry=0 | 137.2 µs; 7287 ops/s; RME 0.639%; n=114; retry=0 | 286.5–294.1; 261.0–270.7; 259.8–269.5 |
| replace-list-watchers | 10000 | 1464.7 µs; 683 ops/s; RME 0.702%; n=171; retry=0 | 1350.7 µs; 740 ops/s; RME 0.764%; n=186; retry=0 | 1471.1 µs; 680 ops/s; RME 0.931%; n=170; retry=0 | 289.9–298.2; 302.2–313.6; 284.9–299.7 |
| layer-field-read | 100 | 2.822 µs; 354384 ops/s; RME 0.432%; n=174; retry=0 | 2.931 µs; 341179 ops/s; RME 0.475%; n=167; retry=0 | 3.189 µs; 313554 ops/s; RME 0.365%; n=154; retry=0 | 4.260–4.332; 4.090–4.168; 3.831–3.950 |
| layer-field-read | 1000 | 31.14 µs; 32115 ops/s; RME 0.382%; n=126; retry=0 | 31.27 µs; 31977 ops/s; RME 0.515%; n=125; retry=0 | 39.45 µs; 25348 ops/s; RME 1.073%; n=100; retry=0 | 4.088–4.153; 3.943–4.049; 3.141–3.262 |
| layer-field-read | 10000 | 487.5 µs; 2051 ops/s; RME 2.031%; n=129; retry=0 | 327.1 µs; 3057 ops/s; RME 0.872%; n=192; retry=0 | 357.7 µs; 2795 ops/s; RME 1.105%; n=175; retry=0 | 2.756–2.909; 4.298–4.472; 3.591–3.729 |
| relation-unrelated-write | 100 | 0.381 µs; 2627639 ops/s; RME 0.473%; n=161; retry=0 | 0.360 µs; 2779290 ops/s; RME 0.791%; n=170; retry=0 | 0.372 µs; 2690066 ops/s; RME 0.430%; n=165; retry=0 | 16.52–16.99; 17.56–18.18; 16.27–17.39 |
| relation-unrelated-write | 1000 | 0.383 µs; 2614068 ops/s; RME 0.733%; n=160; retry=0 | 0.403 µs; 2480923 ops/s; RME 0.475%; n=152; retry=0 | 0.429 µs; 2331365 ops/s; RME 0.465%; n=143; retry=0 | 16.09–16.72; 15.44–16.20; 14.30–14.79 |
| relation-unrelated-write | 10000 | 0.407 µs; 2454873 ops/s; RME 0.890%; n=150; retry=0 | 0.422 µs; 2369425 ops/s; RME 1.145%; n=145; retry=0 | 0.417 µs; 2396587 ops/s; RME 0.432%; n=147; retry=0 | 15.63–16.37; 14.57–15.16; 14.35–14.61 |
| item-read | 100 | 0.065 µs; 15295077 ops/s; RME 0.281%; n=934; retry=0 | 0.065 µs; 15412566 ops/s; RME 0.397%; n=941; retry=0 | 0.065 µs; 15457633 ops/s; RME 0.268%; n=944; retry=0 | 5.355–5.472; 5.245–5.323; 5.347–5.412 |
| item-read | 1000 | 0.076 µs; 13092880 ops/s; RME 0.565%; n=800; retry=0 | 0.078 µs; 12829473 ops/s; RME 0.684%; n=784; retry=0 | 0.078 µs; 12817831 ops/s; RME 0.574%; n=783; retry=0 | 4.634–4.717; 4.571–4.729; 4.524–4.616 |
| item-read | 10000 | 0.098 µs; 10222394 ops/s; RME 1.547%; n=2496; retry=0 | 0.092 µs; 10869847 ops/s; RME 1.862%; n=1327; retry=0 | 0.090 µs; 11078034 ops/s; RME 1.055%; n=10819; retry=0 | 3.692–3.917; 4.067–4.388; 4.364–4.628 |
| composite-index-membership-write | 1000 | 1.930 µs; 518247 ops/s; RME 0.493%; n=254; retry=0 | 1.959 µs; 510393 ops/s; RME 0.635%; n=250; retry=0 | 1.899 µs; 526642 ops/s; RME 0.454%; n=258; retry=0 | 1.548–1.578; 1.505–1.549; 1.569–1.595 |
| list-read | 100 | 0.053 µs; 19018511 ops/s; RME 0.480%; n=1161; retry=0 | 0.053 µs; 18703516 ops/s; RME 0.467%; n=1142; retry=0 | 0.051 µs; 19651873 ops/s; RME 0.289%; n=1200; retry=0 | 778.2–789.0; 711.8–723.6; 734.5–741.3 |
| list-read | 1000 | 0.210 µs; 4769741 ops/s; RME 1.572%; n=292; retry=0 | 0.278 µs; 3601367 ops/s; RME 2.631%; n=220; retry=0 | 0.211 µs; 4737889 ops/s; RME 1.362%; n=290; retry=0 | 1961.0–2039.5; 1364.5–1449.3; 1771.6–1829.2 |
| list-read | 10000 | 2.563 µs; 390117 ops/s; RME 0.975%; n=762; retry=1 | 2.546 µs; 392697 ops/s; RME 1.300%; n=768; retry=1 | 2.138 µs; 467741 ops/s; RME 1.695%; n=115; retry=0 | 1997.5–2063.5; 1789.2–1862.5; 2001.2–2103.8 |
| filtered-list-read | 100 | 4.576 µs; 218542 ops/s; RME 0.346%; n=107; retry=0 | 4.399 µs; 227328 ops/s; RME 0.817%; n=112; retry=0 | 4.338 µs; 230545 ops/s; RME 0.249%; n=226; retry=0 | 5.333–5.428; 5.067–5.205; 5.195–5.257 |
| filtered-list-read | 1000 | 4.519 µs; 221306 ops/s; RME 0.681%; n=109; retry=0 | 4.285 µs; 233398 ops/s; RME 0.609%; n=114; retry=0 | 4.200 µs; 238112 ops/s; RME 0.328%; n=117; retry=0 | 33.79–34.63; 32.60–33.40; 32.46–33.06 |
| filtered-list-read | 10000 | 4.997 µs; 200112 ops/s; RME 0.356%; n=196; retry=0 | 4.342 µs; 230315 ops/s; RME 0.446%; n=225; retry=0 | 4.375 µs; 228548 ops/s; RME 0.800%; n=112; retry=0 | 389.6–401.7; 420.7–437.6; 407.2–423.9 |
| indexed-list-read | 100 | 0.147 µs; 6795826 ops/s; RME 0.515%; n=415; retry=0 | 0.158 µs; 6344648 ops/s; RME 0.618%; n=388; retry=0 | 0.144 µs; 6940364 ops/s; RME 0.382%; n=424; retry=0 | 25.91–26.88; 25.33–27.07; 26.73–27.58 |
| indexed-list-read | 1000 | 0.167 µs; 5986379 ops/s; RME 0.546%; n=366; retry=0 | 0.186 µs; 5367741 ops/s; RME 0.740%; n=328; retry=0 | 0.168 µs; 5944378 ops/s; RME 0.481%; n=363; retry=0 | 173.0–176.2; 153.4–158.0; 166.7–169.4 |
| indexed-list-read | 10000 | 0.346 µs; 2891499 ops/s; RME 1.596%; n=177; retry=0 | 0.391 µs; 2558881 ops/s; RME 1.433%; n=157; retry=0 | 0.363 µs; 2753359 ops/s; RME 2.128%; n=169; retry=0 | 816.1–850.7; 713.5–740.1; 757.7–800.1 |
| batch-write | 100 | 17.53 µs; 57059 ops/s; RME 0.389%; n=112; retry=0 | 18.46 µs; 54166 ops/s; RME 0.464%; n=106; retry=0 | 16.56 µs; 60401 ops/s; RME 0.389%; n=118; retry=0 | 4.433–4.503; 4.246–4.336; 4.643–4.708 |
| batch-write | 1000 | 18.19 µs; 54977 ops/s; RME 0.766%; n=108; retry=0 | 19.11 µs; 52339 ops/s; RME 0.571%; n=103; retry=0 | 16.86 µs; 59320 ops/s; RME 0.361%; n=116; retry=0 | 4.287–4.395; 4.158–4.240; 4.593–4.679 |
| batch-write | 10000 | 17.92 µs; 55815 ops/s; RME 0.750%; n=219; retry=0 | 18.88 µs; 52978 ops/s; RME 0.824%; n=207; retry=0 | 17.83 µs; 56089 ops/s; RME 0.924%; n=110; retry=0 | 4.375–4.479; 4.488–4.639; 4.283–4.430 |
| paused-write-batch | 100 | 4.770 µs; 209641 ops/s; RME 0.401%; n=205; retry=0 | 5.125 µs; 195120 ops/s; RME 0.457%; n=191; retry=0 | 4.594 µs; 217659 ops/s; RME 0.338%; n=213; retry=0 | 3.341–3.389; 3.150–3.216; 3.456–3.504 |
| paused-write-batch | 1000 | 4.981 µs; 200769 ops/s; RME 0.823%; n=197; retry=0 | 5.292 µs; 188953 ops/s; RME 0.440%; n=185; retry=0 | 4.870 µs; 205359 ops/s; RME 0.736%; n=101; retry=0 | 3.265–3.359; 3.129–3.194; 3.258–3.326 |
| paused-write-batch | 10000 | 5.161 µs; 193753 ops/s; RME 0.711%; n=190; retry=0 | 5.668 µs; 176422 ops/s; RME 0.701%; n=173; retry=0 | 5.029 µs; 198833 ops/s; RME 0.856%; n=98; retry=0 | 3.187–3.290; 3.053–3.159; 3.174–3.253 |
| relation-membership-write | 100 | 1.511 µs; 661955 ops/s; RME 0.472%; n=324; retry=0 | 1.560 µs; 641213 ops/s; RME 0.517%; n=157; retry=0 | 1.517 µs; 659061 ops/s; RME 0.426%; n=161; retry=0 | 4.398–4.546; 4.231–4.387; 4.376–4.513 |
| relation-membership-write | 1000 | 1.806 µs; 553629 ops/s; RME 0.502%; n=136; retry=0 | 1.823 µs; 548452 ops/s; RME 0.602%; n=134; retry=0 | 1.801 µs; 555120 ops/s; RME 0.388%; n=136; retry=0 | 3.991–4.179; 3.938–4.086; 3.974–4.123 |
| relation-membership-write | 10000 | 8.779 µs; 113905 ops/s; RME 2.112%; n=1780; retry=3 | 8.625 µs; 115947 ops/s; RME 2.979%; n=906; retry=2 | 8.590 µs; 116418 ops/s; RME 2.974%; n=910; retry=2 | 2.281–2.476; 2.278–2.558; 2.275–2.553 |
| relation-related-field-write | 1000 | 0.392 µs; 2550562 ops/s; RME 0.809%; n=156; retry=0 | 0.399 µs; 2508893 ops/s; RME 0.455%; n=154; retry=0 | 0.374 µs; 2673470 ops/s; RME 0.435%; n=164; retry=0 | 29.44–30.28; 29.30–30.71; 31.00–31.95 |
| composite-index-read | 100 | 0.215 µs; 4651235 ops/s; RME 0.311%; n=284; retry=0 | 0.199 µs; 5015283 ops/s; RME 0.431%; n=307; retry=0 | 0.237 µs; 4219556 ops/s; RME 0.577%; n=258; retry=0 | 17.44–17.77; 19.61–20.23; 15.88–16.42 |
| composite-index-read | 1000 | 0.252 µs; 3963523 ops/s; RME 0.861%; n=242; retry=0 | 0.262 µs; 3821813 ops/s; RME 0.728%; n=234; retry=0 | 0.252 µs; 3967463 ops/s; RME 0.435%; n=243; retry=0 | 109.6–112.5; 109.7–113.3; 110.1–111.7 |
| composite-index-read | 10000 | 0.423 µs; 2364333 ops/s; RME 1.045%; n=145; retry=0 | 0.460 µs; 2172930 ops/s; RME 1.075%; n=133; retry=0 | 0.402 µs; 2489761 ops/s; RME 1.078%; n=152; retry=0 | 643.6–661.9; 600.0–617.7; 680.5–704.7 |
| crdt-fresh-write | 1000 | 0.542 µs; 1844595 ops/s; RME 0.415%; n=226; retry=0 | 0.594 µs; 1683865 ops/s; RME 1.317%; n=206; retry=0 | 0.543 µs; 1840977 ops/s; RME 0.595%; n=225; retry=0 | 1.943–1.974; 1.820–1.887; 1.970–2.009 |
| crdt-stale-write | 1000 | 0.385 µs; 2600027 ops/s; RME 0.386%; n=159; retry=0 | 0.391 µs; 2554778 ops/s; RME 0.678%; n=156; retry=0 | 0.393 µs; 2545478 ops/s; RME 0.457%; n=156; retry=0 | 2.083–2.118; 2.055–2.119; 2.015–2.054 |
| nested-relation-write | 1000 | 5.930 µs; 168631 ops/s; RME 0.600%; n=165; retry=0 | 5.987 µs; 167029 ops/s; RME 0.634%; n=164; retry=0 | 6.544 µs; 152802 ops/s; RME 1.314%; n=150; retry=0 | 1.870–1.915; 1.863–1.905; 1.665–1.724 |
| layer-cycle | 100 | 3.153 µs; 317192 ops/s; RME 1.923%; n=155; retry=0 | 3.471 µs; 288140 ops/s; RME 2.504%; n=141; retry=0 | 3.139 µs; 318557 ops/s; RME 1.818%; n=156; retry=0 | 9.848–10.41; 8.596–9.202; 9.233–9.698 |
| layer-cycle | 1000 | 3.227 µs; 309853 ops/s; RME 2.371%; n=152; retry=0 | 3.398 µs; 294321 ops/s; RME 2.284%; n=144; retry=0 | 3.057 µs; 327104 ops/s; RME 2.303%; n=320; retry=0 | 86.08–91.51; 77.29–81.75; 84.06–88.65 |
| layer-cycle | 10000 | 3.169 µs; 315553 ops/s; RME 2.066%; n=155; retry=0 | 3.232 µs; 309359 ops/s; RME 2.158%; n=152; retry=0 | 3.111 µs; 321466 ops/s; RME 1.974%; n=158; retry=0 | 1035.6–1113.9; 964.2–1032.6; 985.8–1049.5 |
| serialize-state | 100 | 2.198 µs; 454977 ops/s; RME 0.757%; n=112; retry=0 | 2.202 µs; 454233 ops/s; RME 0.581%; n=111; retry=0 | 2.195 µs; 455498 ops/s; RME 0.652%; n=112; retry=0 | 12.65–12.97; 11.27–11.50; 11.31–11.57 |
| serialize-state | 1000 | 16.16 µs; 61895 ops/s; RME 0.566%; n=121; retry=0 | 16.63 µs; 60145 ops/s; RME 1.247%; n=118; retry=0 | 15.70 µs; 63676 ops/s; RME 0.535%; n=125; retry=0 | 16.52–16.84; 14.37–14.85; 15.33–15.56 |
| serialize-state | 10000 | 137.4 µs; 7276 ops/s; RME 0.448%; n=114; retry=0 | 137.5 µs; 7272 ops/s; RME 0.530%; n=114; retry=0 | 139.8 µs; 7154 ops/s; RME 0.651%; n=112; retry=0 | 22.96–23.64; 21.06–21.72; 21.28–22.06 |
| hydrate-state | 100 | 13.27 µs; 75376 ops/s; RME 1.646%; n=148; retry=0 | 13.61 µs; 73475 ops/s; RME 1.976%; n=144; retry=0 | 13.82 µs; 72344 ops/s; RME 2.101%; n=142; retry=0 | 4.125–4.441; 4.010–4.356; 3.796–4.139 |
| hydrate-state | 1000 | 100.8 µs; 9916 ops/s; RME 1.863%; n=156; retry=0 | 100.6 µs; 9937 ops/s; RME 1.918%; n=156; retry=0 | 99.54 µs; 10046 ops/s; RME 1.649%; n=157; retry=0 | 5.298–5.752; 5.374–5.872; 5.195–5.641 |
| hydrate-state | 10000 | 1560.8 µs; 641 ops/s; RME 2.062%; n=641; retry=1 | 1561.6 µs; 640 ops/s; RME 2.068%; n=641; retry=1 | 1517.1 µs; 659 ops/s; RME 2.010%; n=660; retry=1 | 3.576–3.812; 3.406–3.627; 3.389–3.598 |
| composite-write-no-watcher | 1000 | 0.892 µs; 1121538 ops/s; RME 0.341%; n=274; retry=0 | 0.889 µs; 1125107 ops/s; RME 0.369%; n=138; retry=0 | 0.886 µs; 1128859 ops/s; RME 0.463%; n=138; retry=0 | 2.415–2.446; 2.486–2.532; 2.439–2.481 |
| composite-write-direct-watcher | 1000 | 1.752 µs; 570808 ops/s; RME 0.394%; n=279; retry=0 | 1.798 µs; 556103 ops/s; RME 0.570%; n=136; retry=0 | 1.780 µs; 561907 ops/s; RME 0.837%; n=138; retry=0 | 1.379–1.398; 1.363–1.391; 1.338–1.377 |
| scalar-write-direct-watcher | 1000 | 1.701 µs; 587833 ops/s; RME 0.747%; n=144; retry=0 | 1.756 µs; 569510 ops/s; RME 0.471%; n=140; retry=0 | 1.650 µs; 605899 ops/s; RME 0.532%; n=148; retry=0 | 3.507–3.690; 3.442–3.613; 3.519–3.691 |

## Residual interpretation

- Legacy acceptance failures: none.
- Clear v4 regressions versus v3: none.
- Clear v4 regressions versus v2: none.
- Clear v4 regressions versus v1: none.
- CPU profile rstore-v4-continued-list.cpuprofile: Self samples identify remaining candidate-side hot functions without legacy workload pollution.
- Candidate self samples: readItems=5722, track=173, trackFlat=11, createCacheVersionRegistry=1, writeItemNow=1, ensureCollection=1, getWrappedItem=1, createCache=0, createCacheRuntime=0, writeItems=0, enqueueOperation=0, flushQueuedOperations=0.

Detailed means, throughput, RME, samples, batch sizes, retries, reactive counts, and intervals remain in companion JSON.
