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

After three same-machine v5 full runs:

```bash
pnpm --filter @rstore/vue benchmark:combine-reports /tmp/v5-1.log /tmp/v5-2.log /tmp/v5-3.log
```

Pass three additional frozen-v4 logs to enforce same-machine v5/v4 duration
targets: median no more than 10% slower and every run pairing no more than 15%
slower.

```bash
pnpm --filter @rstore/vue benchmark:combine-reports /tmp/v5-{1,2,3}.log /tmp/v4-{1,2,3}.log
```

Set `RSTORE_CPU_PROFILE=/path/to/profile.cpuprofile` to embed focused CPU evidence in generated report.

Combiner rejects wrong run counts, row-count drift, and Node-version mismatch before replacing six-implementation Markdown/JSON evidence snapshots.

## Retained-memory benchmarks

Memory profiles run legacy and Data Core in separate Node processes with
`--expose-gc`. Every checkpoint yields one event-loop turn, forces collection
five times, and keeps lowest `heapUsed` reading. Metrics stay signed:

- setup retained heap above module baseline;
- warmed steady-state retained heap;
- retained growth after bounded repeated work;
- growth normalized by scenario workload unit;
- residual heap after scope stop, cache disposal, and reference release.

Run quick ownership profile or full size/churn matrix:

```bash
pnpm --filter @rstore/core build
pnpm --filter @rstore/vue benchmark:memory
pnpm --filter @rstore/vue benchmark:memory:full
```

Use `RSTORE_MEMORY_SCENARIO` to select stable scenario id. Add
`RSTORE_MEMORY_ITEMS` only with scenario filter. `RSTORE_MEMORY_TRIALS` accepts
integer from 1 through 20. Example:

```bash
RSTORE_MEMORY_SCENARIO=materialized-wrappers RSTORE_MEMORY_ITEMS=10000 \
  RSTORE_MEMORY_TRIALS=3 pnpm --filter @rstore/vue benchmark:memory:full
```

Full historical evidence creates controller-owned detached worktrees, installs
locked dependencies, builds Core serially, runs three full reports for Data
Core v1-v4 plus current v5 candidate, then removes only those temporary worktrees:

```bash
pnpm --filter @rstore/vue benchmark:memory:versions
```

Failure logs remain under printed `/tmp/rstore-memory-*` path. Successful run
writes `reports/data-core-memory-v1-v2-v3-v4-v5.{json,md}` only after every version,
row matrix, environment, semantic check, and frozen legacy hash validates.

Report is informational evidence snapshot, not CI gate or stored memory budget.
`growth detected` means all three scenario deltas exceed matching empty-control
envelope. Other growth stays `inconclusive`; negative values remain visible as
GC/runtime noise. Quick profile usually completes in about 20 seconds; full
profile in about 90 seconds per trial on current development machine. Historical
version run includes locked installs/builds and can take tens of minutes.

## Big-payload benchmarks

Payload profiles isolate every implementation and row in its own Node 23+
process with `--expose-gc`. Deterministic input is constructed before timed
work. Worker records input-retained heap, operation duration, maximum-RSS
delta, retained cache heap after caller source release, and post-disposal
residual. Heap checkpoints keep lowest reading across five forced collections.

Run quick smoke profile or exact full large-payload matrix:

```bash
pnpm --filter @rstore/shared build
pnpm --filter @rstore/core build
pnpm --filter @rstore/vue benchmark:payload
pnpm --filter @rstore/vue benchmark:payload:full
```

Quick profile usually takes under 15 seconds. One full trial usually takes
under one minute on current development machine. Strict diagnostic filters:

```bash
RSTORE_PAYLOAD_SCENARIO=write-wide RSTORE_PAYLOAD_ITEMS=10000 \
  RSTORE_PAYLOAD_FIELDS=64 RSTORE_PAYLOAD_TRIALS=3 \
  pnpm --filter @rstore/vue benchmark:payload:full
```

`RSTORE_PAYLOAD_ITEMS` and `RSTORE_PAYLOAD_FIELDS` require
`RSTORE_PAYLOAD_SCENARIO`. `RSTORE_PAYLOAD_TRIALS` accepts integer from 1
through 20. Unset all filters for comparable evidence.

Full historical controller creates one detached temporary worktree at exact v5
commit, installs locked dependencies, builds Shared and Core serially, then runs
three CPU trials, three retained-memory trials, and five alternating payload
trials for v5 and current v6:

```bash
pnpm --filter @rstore/vue benchmark:payload:versions
```

Failure preserves logs under printed `/tmp/rstore-payload-*` path. Successful
run writes these evidence snapshots only after environment, dimensions, run
counts, candidate identity, and frozen legacy hash match:

- `reports/data-core-big-payload-v5-v6.{json,md}`
- `reports/data-core-memory-v5-v6.{json,md}`
- `reports/data-core-v5-v6.{json,md}`

Duration, peak RSS, and retained heap are lower-is-better. Zero-crossing RSS or
heap values use signed absolute deltas instead of ratios. Expected retained
cache state before teardown is distinct from residual state after disposal.
JSON rows also retain signed metrics after matching input-only or empty-lifecycle
control subtraction. Noisy control-overlapping readings remain `inconclusive`. Reports are
informational evidence snapshots, not baselines, budgets, or CI gates.
