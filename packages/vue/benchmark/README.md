# `writeItems` publication benchmark

From the repository root, after installing dependencies and building packages, run:

```sh
pnpm --filter @rstore/vue benchmark:write-items
```

The command exercises the real Vue cache runtime, the public collection `peekMany` query API, a
Vue computed, and a synchronous watcher. It measures 100 and 1,000 deterministic flat items. Every
warmup and measured sample creates an isolated store and cache. The two modes alternate execution
order to reduce order bias.

The optimized mode calls the public `cache.writeItems` API. The control reproduces the flat,
non-staggered `processQueuedWriteItems` path at the parent of the optimization commit
(`3db362ce95fe5aed6c1e461f6f455ccf50354ad1`): it calls the real `writeItemNow` once per item with
`fromWriteItems: true`, then emits the one outer `afterCacheWrite` hook. The current no-batch
`writeItemNow` path retains the legacy per-item reactive publication semantics. This is an exact
control for the benchmarked flat, non-staggered case; it does not claim to reproduce legacy
staggering, nested-relation settlement, or error handling.

The JSON output contains Git revision and benchmark-source and helper-source provenance, environment metadata, every
measured iteration, and median, p95, and MAD summaries. It also reports structural evidence. For
1,000 items, the control must expose 1,000
visible query transitions while the optimized path must expose one. The lower-level synchronous
watcher/query counts are also asserted (the legacy write triggers three recomputations per item:
pre-write invalidation, reactive assignment, and post-write invalidation). Both modes must produce
the same final cache and query digest and exactly one outer hook.

Timing values are descriptive, not pass/fail thresholds. The command fails only when final
semantics, hook counts, or publication/recomputation counts differ. When reporting results, run the
command from a clean worktree and fresh process, report the source and environment blocks plus the
1,000-item medians with p95 and MAD. Raw per-iteration values in the same output are the provenance
for the quoted summary; generated output is intentionally not checked in.
