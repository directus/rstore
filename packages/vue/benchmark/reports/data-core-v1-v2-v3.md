# Data Core v1/v2/v3 performance report

Generated: 2026-08-27T14:09:42.687Z

## Environment and versions

- CPU: AMD Ryzen 9 9950X 16-Core Processor
- OS: Linux 7.1.8-200.fc44.x86_64 x64
- Node: v23.9.0
- pnpm: 10.20.0
- Legacy: packages/vue/benchmark/legacy-cache.ts
- Data Core v1: 30318e8cae55ae623b112865c8ae04c4c6d43242
- Data Core v2/base: ffdc11cab53301233881c0512ac5139118779ca9
- Data Core v3: uncommitted working tree based on ffdc11cab53301233881c0512ac5139118779ca9
- Candidate diff SHA-256: 858fe17fd5eda7a96d2dfa5e0a3506c7e3f2df26c5fe06dcbb2a7ca6f100fd1f

## Acceptance summary

- Run 1: 59/59 engine faster, 0 legacy faster, 0 no clear difference, 0 noisy; max RME 2.918%; retries 9.
- Run 2: 59/59 engine faster, 0 legacy faster, 0 no clear difference, 0 noisy; max RME 2.917%; retries 4.
- Run 3: 59/59 engine faster, 0 legacy faster, 0 no clear difference, 0 noisy; max RME 2.899%; retries 4.
- Clear v3 regressions versus v2: 0.
- Clear v3 regressions versus v1: 0.
- V1-normalized point estimates below parity: 4; none count as regressions unless confidence envelope stays below 1.

Ratio above 1 favors Data Core v3. Version envelopes compare paired legacy-normalized speedups across every run pairing; confidence envelopes also retain each benchmark margin.

## All 59 benchmark rows

| Scenario | Items | Legacy median µs | v1 median µs | v2 median µs | v3 median µs | v3/legacy range | v3/v2 envelope | v3/v1 envelope |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| field write / list watchers | 100 | 1700.1 | 0.599 | 0.738 | 0.331 | 5068.3–5585.3 | 2.169–2.432 | 1.631–1.911 |
| field write / list watchers | 1000 | 17293.6 | 0.601 | 0.807 | 0.338 | 50791.7–53576.5 | 2.150–2.437 | 1.520–1.801 |
| field write / list watchers | 10000 | 231631.2 | 0.725 | 1.119 | 0.411 | 503506.5–566567.3 | 2.087–2.748 | 1.463–1.803 |
| field write / item watchers | 100 | 11.73 | 0.878 | 0.795 | 0.488 | 23.31–26.48 | 1.477–1.825 | 1.610–1.974 |
| field write / item watchers | 1000 | 11.45 | 0.691 | 0.745 | 0.390 | 28.31–30.87 | 1.640–1.983 | 1.568–1.793 |
| field write / item watchers | 10000 | 11.72 | 0.723 | 0.900 | 0.419 | 27.95–31.56 | 1.976–2.381 | 1.572–1.914 |
| field write + imperative list read | 100 | 37.71 | 0.835 | 0.923 | 0.502 | 74.76–78.08 | 1.768–2.046 | 1.531–1.670 |
| field write + imperative list read | 1000 | 369.6 | 1.252 | 1.418 | 0.750 | 469.5–512.1 | 1.699–1.994 | 1.454–1.740 |
| field write + imperative list read | 10000 | 4326.4 | 4.414 | 4.853 | 2.992 | 1350.7–1468.9 | 1.277–1.744 | 1.128–1.455 |
| replace / list watchers | 100 | 3658.9 | 36.69 | 35.42 | 31.41 | 110.3–117.9 | 1.007–1.123 | 1.009–1.106 |
| replace / list watchers | 1000 | 36888.5 | 197.4 | 162.0 | 161.6 | 227.7–235.5 | 0.903–1.016 | 1.093–1.201 |
| replace / list watchers | 10000 | 531499.4 | 2085.6 | 1852.4 | 1792.7 | 252.9–296.5 | 0.916–1.233 | 1.001–1.290 |
| read fields / 5 optimistic layers | 100 | 12.67 | 24.11 | 3.160 | 3.347 | 3.662–3.893 | 0.895–0.979 | 6.172–6.722 |
| read fields / 5 optimistic layers | 1000 | 136.4 | 256.7 | 33.09 | 36.30 | 3.461–3.790 | 0.875–1.056 | 5.783–6.789 |
| read fields / 5 optimistic layers | 10000 | 1511.9 | 2989.7 | 422.2 | 419.4 | 3.332–3.814 | 0.896–1.092 | 6.018–9.031 |
| relation read / unrelated writes | 100 | 6.277 | 0.894 | 0.831 | 0.476 | 12.91–13.64 | 1.634–1.795 | 1.674–1.811 |
| relation read / unrelated writes | 1000 | 6.285 | 0.945 | 0.891 | 0.486 | 12.72–13.13 | 1.708–1.901 | 1.581–1.819 |
| relation read / unrelated writes | 10000 | 6.446 | 1.010 | 0.953 | 0.503 | 11.32–12.80 | 1.612–2.003 | 1.662–1.942 |
| read item | 100 | 0.385 | 0.425 | 0.113 | 0.084 | 4.559–4.747 | 1.296–1.676 | 4.461–5.313 |
| read item | 1000 | 0.392 | 0.428 | 0.138 | 0.092 | 4.139–4.400 | 1.300–1.680 | 4.189–4.685 |
| read item | 10000 | 0.468 | 0.623 | 0.143 | 0.105 | 4.086–4.714 | 1.187–1.658 | 4.906–7.605 |
| composite index membership write | 1000 | 3.081 | 5.203 | 2.588 | 2.330 | 1.280–1.341 | 1.087–1.142 | 1.909–2.229 |
| read full list | 100 | 38.79 | 0.107 | 0.062 | 0.057 | 642.8–686.7 | 0.961–1.122 | 1.587–2.001 |
| read full list | 1000 | 390.4 | 0.316 | 0.255 | 0.226 | 1387.5–1761.2 | 0.820–1.136 | 0.963–2.571 |
| read full list | 10000 | 4596.9 | 2.556 | 2.611 | 2.242 | 1996.5–2055.6 | 1.048–1.144 | 1.057–1.612 |
| read filtered limited list | 100 | 22.67 | 16.51 | 5.598 | 5.551 | 4.084–4.102 | 0.939–1.013 | 2.842–2.908 |
| read filtered limited list | 1000 | 139.6 | 17.32 | 5.608 | 5.948 | 22.99–25.12 | 0.914–1.014 | 2.710–3.123 |
| read filtered limited list | 10000 | 1901.5 | 20.34 | 8.142 | 8.556 | 211.0–242.0 | 0.892–1.103 | 2.144–2.712 |
| read indexed list | 100 | 3.872 | 1.456 | 0.865 | 0.849 | 4.448–4.747 | 0.943–1.045 | 1.587–1.741 |
| read indexed list | 1000 | 30.09 | 10.05 | 6.622 | 6.788 | 4.332–4.461 | 0.960–1.050 | 1.378–1.496 |
| read indexed list | 10000 | 285.6 | 92.74 | 62.74 | 64.36 | 4.327–4.645 | 0.947–1.039 | 1.275–1.478 |
| write 100-item batch | 100 | 78.88 | 35.76 | 48.89 | 25.35 | 2.844–3.262 | 1.754–2.136 | 1.246–1.477 |
| write 100-item batch | 1000 | 79.67 | 37.35 | 50.71 | 26.26 | 2.926–3.167 | 1.857–2.086 | 1.315–1.499 |
| write 100-item batch | 10000 | 83.16 | 42.62 | 55.28 | 26.40 | 3.045–3.232 | 1.963–2.195 | 1.415–1.699 |
| pause / 20 writes / resume | 100 | 16.30 | 8.133 | 10.98 | 5.858 | 2.659–2.909 | 1.767–2.031 | 1.313–1.486 |
| pause / 20 writes / resume | 1000 | 16.32 | 8.630 | 11.40 | 6.150 | 2.461–2.770 | 1.702–2.099 | 1.236–1.436 |
| pause / 20 writes / resume | 10000 | 17.11 | 10.06 | 12.35 | 6.663 | 2.568–2.813 | 1.819–2.080 | 1.354–1.590 |
| relation membership write | 100 | 7.016 | 3.730 | 2.127 | 1.949 | 3.468–3.706 | 1.001–1.156 | 1.725–1.945 |
| relation membership write | 1000 | 7.462 | 3.954 | 2.489 | 2.372 | 3.124–3.318 | 1.021–1.121 | 1.574–1.846 |
| relation membership write | 10000 | 20.61 | 10.90 | 9.394 | 9.015 | 2.286–2.299 | 1.000–1.030 | 1.210–1.264 |
| relation read / related field writes | 1000 | 11.81 | 0.943 | 0.910 | 0.469 | 24.44–25.51 | 1.758–1.849 | 1.588–1.841 |
| read composite index | 100 | 3.793 | 1.590 | 1.009 | 0.985 | 3.782–3.903 | 0.945–1.021 | 1.332–1.411 |
| read composite index | 1000 | 28.13 | 10.97 | 7.009 | 6.781 | 4.114–4.239 | 0.938–1.027 | 1.278–1.389 |
| read composite index | 10000 | 277.0 | 95.41 | 64.02 | 63.66 | 4.236–4.389 | 0.869–1.001 | 1.223–1.365 |
| accepted CRDT field write | 1000 | 1.170 | 1.003 | 1.141 | 0.748 | 1.547–1.598 | 1.389–1.577 | 1.113–1.347 |
| rejected stale CRDT field write | 1000 | 0.897 | 1.032 | 1.090 | 0.546 | 1.638–1.681 | 1.467–1.675 | 1.333–1.381 |
| write parent + 10 nested children | 1000 | 11.41 | 9.074 | 6.969 | 5.830 | 1.784–1.994 | 1.081–1.219 | 1.379–1.589 |
| optimistic layer cycle | 100 | 30.53 | 3.840 | 3.539 | 3.455 | 8.549–8.836 | 0.949–1.032 | 1.015–1.147 |
| optimistic layer cycle | 1000 | 277.3 | 3.972 | 3.471 | 3.500 | 71.08–81.98 | 0.877–1.084 | 0.917–1.131 |
| optimistic layer cycle | 10000 | 3287.8 | 3.934 | 3.694 | 3.419 | 896.9–961.5 | 0.923–1.080 | 0.900–1.080 |
| serialize cache state | 100 | 26.14 | 2.380 | 2.409 | 2.220 | 10.68–11.90 | 0.916–1.109 | 0.917–1.147 |
| serialize cache state | 1000 | 251.5 | 19.64 | 17.50 | 16.49 | 13.92–15.90 | 0.893–1.099 | 0.954–1.230 |
| serialize cache state | 10000 | 3091.7 | 159.4 | 153.3 | 140.9 | 20.21–22.29 | 0.957–1.177 | 1.019–1.152 |
| hydrate cache state | 100 | 54.27 | 25.13 | 31.79 | 24.89 | 2.068–2.209 | 1.110–1.429 | 0.862–0.984 |
| hydrate cache state | 1000 | 546.3 | 201.4 | 251.8 | 203.0 | 2.523–2.713 | 1.131–1.250 | 0.869–0.996 |
| hydrate cache state | 10000 | 5441.1 | 2793.4 | 3562.4 | 2893.9 | 1.830–1.886 | 1.155–1.306 | 0.882–1.025 |
| composite membership write / no watcher | 1000 | 2.196 | 2.093 | 1.462 | 0.972 | 2.254–2.281 | 1.459–1.512 | 2.167–2.274 |
| composite membership write / direct watcher | 1000 | 2.489 | 3.780 | 2.427 | 2.184 | 1.121–1.150 | 1.071–1.137 | 1.739–1.805 |
| scalar membership write / direct watcher | 1000 | 6.073 | 2.979 | 2.276 | 2.100 | 2.862–2.903 | 1.056–1.110 | 1.324–1.435 |

## Data Core v3 per-run evidence

| Scenario | Items | Run 1 | Run 2 | Run 3 | Paired legacy intervals |
|---|---:|---|---|---|---|
| field-write-list-watchers | 100 | 0.331 µs; 3023308 ops/s; RME 0.374%; n=185; retry=0 | 0.323 µs; 3096473 ops/s; RME 0.371%; n=189; retry=0 | 0.331 µs; 3021091 ops/s; RME 0.173%; n=185; retry=0 | 5086.4–5193.7; 5495.4–5675.9; 5030.3–5106.4 |
| field-write-list-watchers | 1000 | 0.347 µs; 2881279 ops/s; RME 0.608%; n=176; retry=0 | 0.323 µs; 3098055 ops/s; RME 0.367%; n=190; retry=0 | 0.338 µs; 2955688 ops/s; RME 0.343%; n=181; retry=0 | 52287.0–54052.6; 53191.1–53964.7; 50313.6–51273.1 |
| field-write-list-watchers | 10000 | 0.409 µs; 2445988 ops/s; RME 0.845%; n=598; retry=1 | 0.411 µs; 2435901 ops/s; RME 0.769%; n=595; retry=1 | 0.491 µs; 2038351 ops/s; RME 2.775%; n=498; retry=1 | 547492.8–585966.9; 520186.8–543006.0; 478597.3–529837.6 |
| field-write-item-watchers | 100 | 0.464 µs; 2154323 ops/s; RME 0.499%; n=132; retry=0 | 0.488 µs; 2047943 ops/s; RME 1.230%; n=125; retry=0 | 0.490 µs; 2039821 ops/s; RME 0.606%; n=125; retry=0 | 26.22–26.74; 22.95–23.67; 23.67–24.21 |
| field-write-item-watchers | 1000 | 0.390 µs; 2565128 ops/s; RME 0.355%; n=157; retry=0 | 0.369 µs; 2710373 ops/s; RME 0.535%; n=166; retry=0 | 0.404 µs; 2473923 ops/s; RME 0.590%; n=152; retry=0 | 30.63–31.11; 29.97–30.48; 28.00–28.63 |
| field-write-item-watchers | 10000 | 0.436 µs; 2292273 ops/s; RME 1.586%; n=140; retry=0 | 0.365 µs; 2738550 ops/s; RME 0.462%; n=168; retry=0 | 0.419 µs; 2384686 ops/s; RME 1.036%; n=146; retry=0 | 27.86–29.11; 31.24–31.88; 27.46–28.46 |
| field-write-list-read | 100 | 0.502 µs; 1990864 ops/s; RME 1.155%; n=122; retry=0 | 0.469 µs; 2133548 ops/s; RME 0.492%; n=131; retry=0 | 0.504 µs; 1982451 ops/s; RME 0.629%; n=121; retry=0 | 73.67–76.69; 77.47–78.69; 73.95–75.58 |
| field-write-list-read | 1000 | 0.750 µs; 1332644 ops/s; RME 1.009%; n=163; retry=0 | 0.722 µs; 1385569 ops/s; RME 1.106%; n=170; retry=0 | 0.835 µs; 1197584 ops/s; RME 1.744%; n=147; retry=0 | 466.5–480.3; 504.5–519.7; 457.2–482.3 |
| field-write-list-read | 10000 | 2.992 µs; 334223 ops/s; RME 1.934%; n=164; retry=0 | 2.945 µs; 339511 ops/s; RME 1.159%; n=166; retry=0 | 3.699 µs; 270335 ops/s; RME 1.034%; n=1057; retry=0 | 1389.2–1467.7; 1443.1–1495.2; 1312.9–1389.4 |
| replace-list-watchers | 100 | 31.41 µs; 31836 ops/s; RME 1.202%; n=249; retry=0 | 30.16 µs; 33157 ops/s; RME 0.764%; n=130; retry=0 | 33.17 µs; 30143 ops/s; RME 1.272%; n=236; retry=0 | 115.4–120.4; 114.7–117.8; 108.0–112.7 |
| replace-list-watchers | 1000 | 160.5 µs; 6231 ops/s; RME 1.179%; n=195; retry=0 | 161.6 µs; 6187 ops/s; RME 1.022%; n=194; retry=0 | 166.6 µs; 6003 ops/s; RME 0.677%; n=188; retry=0 | 221.2–234.3; 223.7–232.9; 229.9–241.3 |
| replace-list-watchers | 10000 | 1792.7 µs; 558 ops/s; RME 0.795%; n=558; retry=1 | 2118.7 µs; 472 ops/s; RME 1.801%; n=119; retry=0 | 1654.9 µs; 604 ops/s; RME 0.553%; n=152; retry=0 | 286.9–306.2; 243.2–262.8; 253.4–259.8 |
| layer-field-read | 100 | 3.460 µs; 288985 ops/s; RME 0.383%; n=142; retry=0 | 3.347 µs; 298800 ops/s; RME 0.506%; n=146; retry=0 | 3.290 µs; 303989 ops/s; RME 0.483%; n=149; retry=0 | 3.631–3.694; 3.848–3.939; 3.734–3.815 |
| layer-field-read | 1000 | 40.88 µs; 24464 ops/s; RME 0.935%; n=96; retry=0 | 36.30 µs; 27549 ops/s; RME 0.733%; n=108; retry=0 | 36.00 µs; 27779 ops/s; RME 0.451%; n=218; retry=0 | 3.392–3.533; 3.665–3.788; 3.706–3.875 |
| layer-field-read | 10000 | 416.9 µs; 2398 ops/s; RME 0.445%; n=1200; retry=1 | 434.4 µs; 2302 ops/s; RME 2.640%; n=288; retry=0 | 419.4 µs; 2385 ops/s; RME 0.685%; n=150; retry=0 | 3.753–3.876; 3.338–3.631; 3.286–3.379 |
| relation-unrelated-write | 100 | 0.475 µs; 2106649 ops/s; RME 0.324%; n=129; retry=0 | 0.486 µs; 2057407 ops/s; RME 0.824%; n=252; retry=0 | 0.476 µs; 2100086 ops/s; RME 0.247%; n=257; retry=0 | 13.00–13.44; 13.37–13.91; 12.74–13.09 |
| relation-unrelated-write | 1000 | 0.484 µs; 2065693 ops/s; RME 0.280%; n=127; retry=0 | 0.498 µs; 2010018 ops/s; RME 0.941%; n=123; retry=0 | 0.486 µs; 2056260 ops/s; RME 0.290%; n=126; retry=0 | 12.87–13.10; 12.76–13.51; 12.51–12.94 |
| relation-unrelated-write | 10000 | 0.503 µs; 1986635 ops/s; RME 0.590%; n=122; retry=0 | 0.577 µs; 1733140 ops/s; RME 1.209%; n=212; retry=0 | 0.496 µs; 2014995 ops/s; RME 0.397%; n=123; retry=0 | 12.57–13.05; 11.06–11.58; 12.48–12.87 |
| item-read | 100 | 0.083 µs; 12028549 ops/s; RME 0.356%; n=735; retry=0 | 0.084 µs; 11883748 ops/s; RME 0.477%; n=726; retry=0 | 0.084 µs; 11917014 ops/s; RME 0.291%; n=728; retry=0 | 4.599–4.675; 4.696–4.799; 4.529–4.590 |
| item-read | 1000 | 0.095 µs; 10566411 ops/s; RME 0.353%; n=645; retry=0 | 0.092 µs; 10922148 ops/s; RME 0.737%; n=667; retry=0 | 0.091 µs; 10977040 ops/s; RME 0.314%; n=670; retry=0 | 4.109–4.168; 4.345–4.456; 4.233–4.293 |
| item-read | 10000 | 0.104 µs; 9599984 ops/s; RME 1.569%; n=2344; retry=0 | 0.118 µs; 8480148 ops/s; RME 1.851%; n=2071; retry=0 | 0.105 µs; 9503453 ops/s; RME 1.408%; n=2321; retry=0 | 3.954–4.222; 4.525–4.909; 4.277–4.614 |
| composite-index-membership-write | 1000 | 2.317 µs; 431533 ops/s; RME 0.426%; n=211; retry=0 | 2.396 µs; 417302 ops/s; RME 0.814%; n=204; retry=0 | 2.330 µs; 429269 ops/s; RME 0.494%; n=210; retry=0 | 1.325–1.356; 1.268–1.304; 1.269–1.291 |
| list-read | 100 | 0.057 µs; 17426852 ops/s; RME 0.204%; n=4255; retry=1 | 0.060 µs; 16630333 ops/s; RME 0.773%; n=1016; retry=0 | 0.056 µs; 17704172 ops/s; RME 0.734%; n=1081; retry=0 | 674.7–681.1; 635.8–649.9; 679.1–694.4 |
| list-read | 1000 | 0.226 µs; 4426240 ops/s; RME 1.799%; n=271; retry=0 | 0.289 µs; 3456188 ops/s; RME 2.243%; n=212; retry=0 | 0.221 µs; 4527193 ops/s; RME 1.690%; n=277; retry=0 | 1692.8–1764.8; 1349.7–1427.1; 1726.9–1796.7 |
| list-read | 10000 | 2.202 µs; 454179 ops/s; RME 1.279%; n=111; retry=0 | 2.303 µs; 434310 ops/s; RME 0.858%; n=849; retry=1 | 2.242 µs; 446093 ops/s; RME 1.839%; n=109; retry=0 | 2016.2–2096.0; 1970.1–2023.4; 1995.1–2112.0 |
| filtered-list-read | 100 | 5.551 µs; 180155 ops/s; RME 0.398%; n=176; retry=0 | 5.522 µs; 181094 ops/s; RME 0.485%; n=177; retry=0 | 5.745 µs; 174077 ops/s; RME 0.494%; n=170; retry=0 | 4.057–4.111; 4.071–4.133; 4.032–4.145 |
| filtered-list-read | 1000 | 5.556 µs; 179993 ops/s; RME 0.420%; n=176; retry=0 | 6.032 µs; 165786 ops/s; RME 0.495%; n=162; retry=0 | 5.948 µs; 168136 ops/s; RME 0.720%; n=165; retry=0 | 24.96–25.28; 22.79–23.19; 23.72–24.31 |
| filtered-list-read | 10000 | 7.840 µs; 127552 ops/s; RME 0.728%; n=125; retry=0 | 9.013 µs; 110953 ops/s; RME 1.279%; n=109; retry=0 | 8.556 µs; 116882 ops/s; RME 1.401%; n=115; retry=0 | 235.9–248.2; 205.3–216.8; 219.1–232.8 |
| indexed-list-read | 100 | 0.860 µs; 1163173 ops/s; RME 0.280%; n=142; retry=0 | 0.849 µs; 1178267 ops/s; RME 0.470%; n=144; retry=0 | 0.847 µs; 1180214 ops/s; RME 0.318%; n=145; retry=0 | 4.385–4.512; 4.519–4.605; 4.678–4.815 |
| indexed-list-read | 1000 | 6.581 µs; 151943 ops/s; RME 0.433%; n=149; retry=0 | 6.947 µs; 143951 ops/s; RME 0.892%; n=141; retry=0 | 6.788 µs; 147317 ops/s; RME 0.710%; n=144; retry=0 | 4.404–4.479; 4.206–4.459; 4.379–4.545 |
| indexed-list-read | 10000 | 61.49 µs; 16262 ops/s; RME 0.389%; n=128; retry=0 | 65.41 µs; 15289 ops/s; RME 0.339%; n=120; retry=0 | 64.36 µs; 15538 ops/s; RME 0.548%; n=243; retry=0 | 4.612–4.678; 4.287–4.367; 4.538–4.641 |
| batch-write | 100 | 24.03 µs; 41621 ops/s; RME 0.272%; n=163; retry=0 | 25.35 µs; 39443 ops/s; RME 0.335%; n=155; retry=0 | 27.74 µs; 36052 ops/s; RME 0.811%; n=141; retry=0 | 3.243–3.282; 3.137–3.173; 2.810–2.878 |
| batch-write | 1000 | 25.04 µs; 39935 ops/s; RME 0.511%; n=156; retry=0 | 26.26 µs; 38074 ops/s; RME 0.503%; n=149; retry=0 | 27.22 µs; 36731 ops/s; RME 0.425%; n=144; retry=0 | 3.135–3.199; 3.060–3.115; 2.901–2.952 |
| batch-write | 10000 | 25.32 µs; 39488 ops/s; RME 0.671%; n=155; retry=0 | 26.40 µs; 37881 ops/s; RME 0.595%; n=148; retry=0 | 27.31 µs; 36622 ops/s; RME 0.718%; n=287; retry=0 | 3.192–3.273; 3.130–3.203; 3.004–3.087 |
| paused-write-batch | 100 | 5.683 µs; 175965 ops/s; RME 0.523%; n=172; retry=0 | 6.129 µs; 163150 ops/s; RME 0.522%; n=160; retry=0 | 5.858 µs; 170719 ops/s; RME 0.417%; n=167; retry=0 | 2.881–2.937; 2.634–2.685; 2.718–2.762 |
| paused-write-batch | 1000 | 5.886 µs; 169889 ops/s; RME 0.580%; n=166; retry=0 | 6.670 µs; 149933 ops/s; RME 1.344%; n=147; retry=0 | 6.150 µs; 162605 ops/s; RME 0.904%; n=159; retry=0 | 2.743–2.798; 2.419–2.503; 2.618–2.689 |
| paused-write-batch | 10000 | 6.062 µs; 164972 ops/s; RME 0.479%; n=162; retry=0 | 7.068 µs; 141475 ops/s; RME 1.793%; n=139; retry=0 | 6.663 µs; 150090 ops/s; RME 0.834%; n=147; retry=0 | 2.784–2.843; 2.492–2.647; 2.528–2.609 |
| relation-membership-write | 100 | 1.949 µs; 513187 ops/s; RME 0.528%; n=251; retry=0 | 1.944 µs; 514453 ops/s; RME 0.652%; n=252; retry=0 | 2.023 µs; 494279 ops/s; RME 0.630%; n=242; retry=0 | 3.406–3.567; 3.579–3.835; 3.372–3.565 |
| relation-membership-write | 1000 | 2.207 µs; 453020 ops/s; RME 0.399%; n=222; retry=0 | 2.389 µs; 418578 ops/s; RME 0.782%; n=205; retry=0 | 2.372 µs; 421500 ops/s; RME 0.610%; n=206; retry=0 | 3.259–3.378; 3.025–3.224; 3.134–3.288 |
| relation-membership-write | 10000 | 9.022 µs; 110844 ops/s; RME 2.918%; n=866; retry=2 | 8.989 µs; 111251 ops/s; RME 2.901%; n=870; retry=2 | 9.015 µs; 110929 ops/s; RME 2.899%; n=868; retry=2 | 2.171–2.434; 2.165–2.427; 2.160–2.420 |
| relation-related-field-write | 1000 | 0.483 µs; 2070010 ops/s; RME 0.305%; n=127; retry=0 | 0.467 µs; 2139291 ops/s; RME 0.297%; n=131; retry=0 | 0.469 µs; 2133019 ops/s; RME 0.420%; n=131; retry=0 | 24.03–24.86; 25.21–25.81; 24.60–25.19 |
| composite-index-read | 100 | 0.977 µs; 1023623 ops/s; RME 0.162%; n=125; retry=0 | 0.985 µs; 1015431 ops/s; RME 0.352%; n=124; retry=0 | 0.989 µs; 1011143 ops/s; RME 0.606%; n=124; retry=0 | 3.855–3.951; 3.778–3.924; 3.723–3.841 |
| composite-index-read | 1000 | 6.709 µs; 149043 ops/s; RME 0.468%; n=146; retry=0 | 6.781 µs; 147469 ops/s; RME 0.752%; n=145; retry=0 | 6.807 µs; 146909 ops/s; RME 0.464%; n=144; retry=0 | 4.206–4.273; 4.101–4.196; 4.077–4.152 |
| composite-index-read | 10000 | 66.39 µs; 15063 ops/s; RME 0.821%; n=118; retry=0 | 63.11 µs; 15845 ops/s; RME 0.371%; n=124; retry=0 | 63.66 µs; 15708 ops/s; RME 0.641%; n=982; retry=0 | 4.179–4.293; 4.356–4.421; 4.281–4.379 |
| crdt-fresh-write | 1000 | 0.751 µs; 1331586 ops/s; RME 0.763%; n=163; retry=0 | 0.748 µs; 1336070 ops/s; RME 0.613%; n=164; retry=0 | 0.739 µs; 1352561 ops/s; RME 0.689%; n=166; retry=0 | 1.521–1.574; 1.548–1.578; 1.579–1.617 |
| crdt-stale-write | 1000 | 0.547 µs; 1826936 ops/s; RME 0.423%; n=112; retry=0 | 0.528 µs; 1895273 ops/s; RME 0.345%; n=116; retry=0 | 0.546 µs; 1831741 ops/s; RME 0.340%; n=224; retry=0 | 1.620–1.656; 1.670–1.691; 1.667–1.686 |
| nested-relation-write | 1000 | 6.399 µs; 156278 ops/s; RME 0.853%; n=153; retry=0 | 5.794 µs; 172579 ops/s; RME 0.440%; n=169; retry=0 | 5.830 µs; 171520 ops/s; RME 0.333%; n=168; retry=0 | 1.757–1.811; 1.975–2.014; 1.895–1.922 |
| layer-cycle | 100 | 3.766 µs; 265506 ops/s; RME 2.292%; n=130; retry=0 | 3.455 µs; 289421 ops/s; RME 1.523%; n=142; retry=0 | 3.449 µs; 289964 ops/s; RME 2.173%; n=142; retry=0 | 8.260–8.851; 8.658–9.020; 8.425–8.920 |
| layer-cycle | 1000 | 4.063 µs; 246139 ops/s; RME 2.669%; n=121; retry=0 | 3.382 µs; 295671 ops/s; RME 1.879%; n=145; retry=0 | 3.500 µs; 285716 ops/s; RME 1.828%; n=140; retry=0 | 68.57–73.74; 80.08–83.96; 74.69–78.16 |
| layer-cycle | 10000 | 3.862 µs; 258907 ops/s; RME 2.520%; n=127; retry=0 | 3.419 µs; 292447 ops/s; RME 1.736%; n=143; retry=0 | 3.419 µs; 292450 ops/s; RME 1.895%; n=143; retry=0 | 862.4–933.2; 929.7–994.4; 910.1–970.0 |
| serialize-state | 100 | 2.448 µs; 408490 ops/s; RME 1.258%; n=200; retry=0 | 2.220 µs; 450474 ops/s; RME 0.497%; n=110; retry=0 | 2.171 µs; 460706 ops/s; RME 0.298%; n=113; retry=0 | 10.45–10.91; 11.80–12.01; 11.39–11.56 |
| serialize-state | 1000 | 18.07 µs; 55342 ops/s; RME 1.550%; n=109; retry=0 | 16.11 µs; 62088 ops/s; RME 0.605%; n=122; retry=0 | 16.49 µs; 60639 ops/s; RME 0.547%; n=119; retry=0 | 13.65–14.20; 15.77–16.03; 14.66–15.02 |
| serialize-state | 10000 | 155.4 µs; 6436 ops/s; RME 1.004%; n=202; retry=0 | 138.7 µs; 7208 ops/s; RME 0.655%; n=113; retry=0 | 140.9 µs; 7096 ops/s; RME 0.465%; n=111; retry=0 | 19.75–20.68; 21.91–22.67; 21.01–21.63 |
| hydrate-state | 100 | 27.35 µs; 36557 ops/s; RME 0.955%; n=572; retry=1 | 24.89 µs; 40176 ops/s; RME 1.326%; n=157; retry=0 | 24.52 µs; 40787 ops/s; RME 1.311%; n=319; retry=0 | 2.022–2.115; 2.110–2.252; 2.133–2.288 |
| hydrate-state | 1000 | 222.3 µs; 4498 ops/s; RME 1.966%; n=141; retry=0 | 201.4 µs; 4966 ops/s; RME 1.110%; n=156; retry=0 | 203.0 µs; 4925 ops/s; RME 1.567%; n=154; retry=0 | 2.407–2.643; 2.618–2.810; 2.539–2.742 |
| hydrate-state | 10000 | 3108.7 µs; 322 ops/s; RME 1.683%; n=644; retry=1 | 2885.8 µs; 347 ops/s; RME 2.917%; n=174; retry=0 | 2893.9 µs; 346 ops/s; RME 1.644%; n=692; retry=1 | 1.777–1.885; 1.783–1.994; 1.808–1.910 |
| composite-write-no-watcher | 1000 | 1.011 µs; 988877 ops/s; RME 0.829%; n=121; retry=0 | 0.955 µs; 1047485 ops/s; RME 0.229%; n=128; retry=0 | 0.972 µs; 1029078 ops/s; RME 0.378%; n=126; retry=0 | 2.222–2.287; 2.266–2.295; 2.242–2.277 |
| composite-write-direct-watcher | 1000 | 2.184 µs; 457858 ops/s; RME 0.236%; n=448; retry=1 | 2.142 µs; 466936 ops/s; RME 0.439%; n=229; retry=0 | 2.221 µs; 450286 ops/s; RME 0.465%; n=220; retry=0 | 1.144–1.157; 1.131–1.147; 1.111–1.130 |
| scalar-write-direct-watcher | 1000 | 2.066 µs; 484085 ops/s; RME 0.528%; n=119; retry=0 | 2.100 µs; 476211 ops/s; RME 0.660%; n=233; retry=0 | 2.115 µs; 472714 ops/s; RME 0.381%; n=116; retry=0 | 2.799–2.926; 2.833–2.974; 2.812–2.929 |

## Residual interpretation

- Legacy acceptance failures: none.
- Clear v3 regressions versus v2: none.
- Clear v3 regressions versus v1: none.
- V1 point estimate layer-cycle (10000): v1 3.934 µs, v3 3.419 µs, normalized ratio 0.992, confidence 0.838–1.151. Optimistic-layer-aware index and wrapper freshness; absolute v3 median is already lower and normalized difference is not conclusive.
- V1 point estimate hydrate-state (100): v1 25.13 µs, v3 24.89 µs, normalized ratio 0.956, confidence 0.809–1.059. Transactional snapshot detachment, collection-key preflight, index membership cache rebuild, module staging, and selective reset invalidation.
- V1 point estimate hydrate-state (1000): v1 201.4 µs, v3 203.0 µs, normalized ratio 0.951, confidence 0.797–1.077. Transactional snapshot detachment, collection-key preflight, index membership cache rebuild, module staging, and selective reset invalidation.
- V1 point estimate hydrate-state (10000): v1 2793.4 µs, v3 2893.9 µs, normalized ratio 0.958, confidence 0.827–1.146. Transactional snapshot detachment, collection-key preflight, index membership cache rebuild, module staging, and selective reset invalidation.
- CPU profile rstore-v3-write-decomposition.cpuprofile: Residual hydration cost concentrates in detached snapshot normalization, collection restoration, and index-cache rebuilding required by transactional stronger semantics; bridge reset dispatch is negligible.
- Hydration self samples: normalizeCollections=293, restoreCollection=121, rebuildIndexes=49, stageCollections=21, setStateNow=2, normalizeSnapshotInput=1, handleReset=1, commitCollections=1.

Detailed implementation means, throughput, RME, samples, batch sizes, reruns, reactive counts, and intervals remain machine-readable in companion JSON.
