# Data Core benchmarks

Run from repository root after building Core:

```bash
pnpm --filter @rstore/core build
pnpm --filter @rstore/vue benchmark
pnpm --filter @rstore/vue benchmark:write-decomposition
pnpm --filter @rstore/vue benchmark:read-regressions
pnpm --filter @rstore/vue benchmark:full
```

Every profile validates state and reactive rerun counters outside timed regions. Console tables are followed by structured JSON containing environment, stable scenario IDs, dimensions, normalized means, throughput, RME, samples, calibrated batch size, retries, counters, confidence interval, and verdict.

Optional CPU profiles:

```bash
RSTORE_BENCH_PROFILE=read RSTORE_BENCH_SCENARIO=list-read RSTORE_BENCH_ITEMS=1000 \
  node --cpu-prof --cpu-prof-name=rstore-engine.cpuprofile node_modules/vite-node/vite-node.mjs packages/vue/benchmark/engine-profile.ts
```

Engine-only mode keeps semantic validation enabled and accepts `RSTORE_BENCH_PROFILE=read|write`, `RSTORE_BENCH_SCENARIO`, `RSTORE_BENCH_ITEMS`, and `RSTORE_BENCH_DURATION`. Inspect `.cpuprofile` files in Chrome DevTools Performance panel. Production code contains no benchmark counters.

Paired profiles also accept `RSTORE_BENCH_SCENARIO` and `RSTORE_BENCH_ITEMS` for focused diagnostic rows. Unset both variables for comparable full reports.

After three same-machine v4 full runs:

```bash
pnpm --filter @rstore/vue benchmark:combine-reports /tmp/v4-1.log /tmp/v4-2.log /tmp/v4-3.log
```

Pass three additional fresh v3 logs to compute same-machine v4/v3 envelopes:

```bash
pnpm --filter @rstore/vue benchmark:combine-reports /tmp/v4-{1,2,3}.log /tmp/v3-{1,2,3}.log
```

Set `RSTORE_CPU_PROFILE=/path/to/profile.cpuprofile` to embed focused CPU evidence in generated report.

Combiner rejects wrong run counts, row-count drift, and Node-version mismatch before replacing five-implementation Markdown/JSON artifacts.
