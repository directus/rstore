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
node --cpu-prof --cpu-prof-name=rstore-write.cpuprofile node_modules/vite-node/vite-node.mjs packages/vue/benchmark/write-decomposition.ts
node --cpu-prof --cpu-prof-name=rstore-full.cpuprofile node_modules/vite-node/vite-node.mjs packages/vue/benchmark/full.ts
```

Keep semantic validation enabled while profiling. Inspect `.cpuprofile` files in Chrome DevTools Performance panel. Production code contains no benchmark counters.

After three same-machine full runs:

```bash
pnpm --filter @rstore/vue benchmark:combine-reports /tmp/v3-1.log /tmp/v3-2.log /tmp/v3-3.log
```

Pass three additional clean-v2 logs when current verification shows environment drift despite matching static fingerprint:

```bash
pnpm --filter @rstore/vue benchmark:combine-reports /tmp/v3-{1,2,3}.log /tmp/v2-{1,2,3}.log
```

Set `RSTORE_CPU_PROFILE=/path/to/profile.cpuprofile` to embed focused CPU evidence in generated report.

Combiner rejects wrong run counts, row-count drift, and Node-version mismatch before replacing four-version Markdown/JSON artifacts.
