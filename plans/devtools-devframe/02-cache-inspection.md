# S02: public cache inspection and disposal

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Dependencies: [S01](./01-package-and-protocol.md).
- Contract: [overview](./00-overview.md).
- Next: [S03](./03-value-projection.md).

## Goal

Expose cache-owned read interface without Vue private-field access and supply missing disposal lifecycle needed by instrumentation.

## File ownership

- Add `packages/shared/src/types/cacheInspection.ts`; export through existing types barrel.
- Modify `packages/shared/src/types/cache.ts` and `types/hooks/lifecycle.ts`.
- Add `packages/vue/src/cache/inspection.ts`; wire through `cache/api.ts` and minimal lifetime state in `cache/types.ts`.
- Extend `test/utils/store/realCacheStore.ts` with direct-Core factory mode; preserve default Vue factory.
- Add focused real-cache inspection/disposal suites under `packages/vue/test/integration/cache/` and Core factory coverage in existing shared helper tests.

Do not replace cache engine, timestamp/tombstone logic, queue policy, or hydration format.

## Inspection contract

Use lazy in-process readers; this API is not serialized directly:

```ts
/** One cache row, preserving public key representation. */
export interface CacheInspectionRow {
  /** Public collection key, including explicit override keys. */
  key: string | number
  /** Borrowed read-only value; consumer must detach before retaining. */
  value: unknown
}

/** Lazy committed collection view. */
export interface CacheInspectionCollection {
  /** Registered collection name. */
  name: string
  /** Current committed row count. */
  count: number
  /** Iterate current rows without wrapping queries or fetching remotely. */
  rows: () => Iterable<CacheInspectionRow>
  /** Current visible count after cache-owned layer resolution. */
  effectiveCount: number
  /** Iterate visible rows without allocating item wrappers or fetching. */
  effectiveRows: () => Iterable<CacheInspectionRow>
}

/** Cache-owned diagnostic readers; never sent over transport directly. */
export interface CacheInspection {
  /** Committed collections; optimistic overlays listed separately. */
  collections: readonly CacheInspectionCollection[]
  /** Read current layers as diagnostic views, including skipped layers. */
  layers: () => Iterable<CacheInspectionLayer>
  /** Read auxiliary cache state without executing collection callbacks. */
  metadata: () => unknown
}
```

Define layer view with ID, collection name, optimistic/skip/prevent flags, row iterator, and deleted-key iterator. Add optional `Cache.inspect?: () => CacheInspection`.

Cache owns effective layer resolution. Reuse existing `getStateForCollection`/layer helpers behind this interface; runtime must not reimplement tombstone, skipped-layer, or optimistic merge policy. Committed and effective views are separate. Existing cache canonicalizes address keys; preserve public representation, without inventing simultaneous distinct records for numeric/string forms sharing canonical identity.

Metadata includes existing markers, module state, query metadata, and supported timestamp/tombstone or plugin metadata already present on this checkout. No new persistence semantics. Skip unsupported custom fields rather than assuming Vue-shaped `getState()`.

## Implementation steps

1. Implement inspection from cache-owned state. Return plain layer flags and lazy rows; no new watchers, writes, markers, or item wrappers.
2. Resolve keys with existing collection `getKey`, including `$overrideKey`, while preserving stored-address agreement. Refactor existing equivalent helper when necessary rather than duplicate key policy.
3. Define lifecycle `dispose({ store })` hook with synchronous return.
4. Make Vue cache disposal idempotent. Stop current timer and emit hook once. Use try/finally so timer cleanup occurs even if another disposal hook throws; observer code catches its own faults.
5. Add disposed guard only for disposal notification; do not rewrite behavior of every cache method.
6. Extend factory options with `factory: 'vue' | 'core'`, default `vue`. Direct mode calls actual `createStoreCore` with existing real cache and typed hooks.
7. Existing cache owner type is Vue-specific. Broaden only structural owner requirements necessary for direct Core mode; do not fake a Vue store proxy or duplicate cache fixture.
8. Custom caches lacking lifecycle notification still support explicit registration disposal. Document this fallback.

## Tests first

- Real writes/deletes/reset reflected in base inspection; layers remain distinct.
- Numeric key, `0`, empty key, `"01"`, and override key preserve representation.
- Layer add/remove/skip/deleted rows correctly inspected.
- Metadata observation changes no values, hooks, or backend call counts.
- Calling cache dispose twice emits hook once and stops timer once.
- Direct factory returns actual Core store while existing factory tests preserve defaults.
- Borrowed views are never presented as immutable snapshots; S03 detaches them.

## Validation

Run focused cache/Core suites, then shared/Vue type checks. Build shared before dependent packages, serially. Verify custom Cache implementation still type-checks because inspect is optional.

## Exit gate

Portable runtime can inspect actual cache through public interface and observe disposal. No private-field fallback required. Existing application cache behavior preserved.

## Receipt

- Files changed: `packages/shared/src/types/{cacheInspection,cache,index}.ts`, `types/hooks/lifecycle.ts`; `packages/vue/src/cache/{inspection,inspectionKeys,api,types,context,writes}.ts`; minimal owner-type broadening in `packages/vue/src/item.ts`; `test/utils/store/realCacheStore.ts`; `packages/vue/test/integration/cache/inspection.spec.ts`.
- Failing tests observed: coordinator ran focused suite before implementation. All five initial scenarios failed because inspection/disposal notification/direct-Core mode were absent. Additional numeric override scenario failed independently with numeric `9` incorrectly read as string `"9"`, before committed key breadcrumbs were introduced. Disposal fault regression failed with later observer receiving no notification after first observer threw, before `callHookWith` hardening.
- Validation: coordinator's serialized focused run passed all six original inspection scenarios (within eight suites / 49 tests) and all nine existing `packages/vue/test/cache-tombstone-lifecycle.spec.ts` scenarios. Disposal fault regression's intended failure was observed, then corrected suite passed. Expanded source-only cache/runtime matrix passes 16 suites / 85 tests, including seventh layer skip scenario and publication regressions. Scoped Vue `tsc --noEmit -p packages/vue/tsconfig.json`, repository ESLint, and diff checks pass. New source modules remain below 300 lines; existing `writes.ts` remains 300 lines.
- Limitations: committed writes retain supplied numeric/string address representation using cache-owned key hints with no duplicate row data. Existing hydration shape intentionally remains unchanged; stripped override identities cannot recover original address type after hydration and fall back to canonical address. Metadata is borrowed; tombstones use lazy iteration, not unrestricted array copying. Custom caches without disposal notification still require explicit registration disposal. Direct-Core mode uses existing Vue cache and its item wrappers; it does not introduce a neutral cache engine.
- S16 cleanup: repository ESLint passes on all S02-owned production/test files after import/generator/callback formatting. Shared direct-Core fixture's one private cache import has documented line-level exception: existing Vue cache factory has no public export, and this reusable wiring helper must use real cache without adding public API only for tests. No package/global lint rule weakened. `writes.ts` remains 300 lines; scoped diff check passes.
- S16 reactive layer correction: observed actual public cache read returning a skipped row because overlay memo returned before reading reactive `layer.skip`. Seventh cache scenario failed on `cache.readItem()` before fix (six passed / one failed). Existing one-per-collection overlay memo now stores lazy computed values; existing layer merge/eviction rules stay intact and no active watcher is introduced. Source-only private config `/tmp/rstore-cache-s02.vitest.config.mjs` passes cache inspection (seven scenarios), existing layer/tombstone lifecycle suites, and runtime inspection: four suites / 26 tests. Changed cache sources/tests pass repository ESLint and scoped diff checks. Direct reads, computed consumers, and inspection agree when public reactive layer skip toggles.
- S16 publication correction: broad workspace run exposed 11 regressions after lazy computed memo change; raw batch writes retain collection-object identity, so Vue computed equality suppressed warmed readers' final publication and observer errors. Reproduced three failures in existing `publication.spec.ts` before correction. Restored original direct collection-ref subscription alongside lazy layer memo, preserving batch/staggering publication and skip correctness. Expanded private source-only run covers every Vue cache integration suite, under-load suite, tombstone lifecycle, and runtime inspection: 16 suites / 85 tests passed. Repository ESLint and scoped diff check pass. Existing valuable publication tests reused; no redundant batch test added.
- S16 fixture typing: full types found four test-only fixture errors; module state now follows nested `Module.state` shape with concrete type, hydration fixtures include required `queryMeta`. Behavioral assertions retained. Seven inspection scenarios pass after correction; scoped Vue TypeScript compile, ESLint, and diff checks pass. No source/build change required.

## Final coordinator acceptance

- Slice evidence: Actual Core/Vue public-cache inspection, typed key addresses, disposal fault isolation, reactive layer skip, and existing publication/under-load behavior verified. Final focused cache matrix passed 16 suites / 85 tests; fixture types and broad workspace regression gates passed.
- Final aggregate gates: `pnpm test` passed 267 files / 1,980 tests; one distribution file / four cases conditionally skipped in default run, then all four passed against final v4 tarballs outside monorepo. Final headless browser matrix passed 13 cases in 6.9 seconds. Seven real Nuxt boot files passed, including final SSR lifecycle/privacy and browser/disabled/production scenarios.
- Final tooling gates: all 21 workspace typecheck scripts plus integration/browser types passed through serial `pnpm test:types`; full repository ESLint passed; shared/Core/Vue/devtools builds and Nuxt module build passed serially; docs build passed. Nine current guide snippets passed strict final-v4 installed declarations without aliases or `skipLibCheck`. After last inherited-getter guard repair, affected devtools library/client typechecks, rebuilt artifact, full suite, browser matrix, and installed consumers were rerun successfully; full workspace types and lint had already passed with unchanged public API. See S16 for external ambient-type boundaries.
- Failure-first tests and private fault probes preserved. Source owners confirmed freeze before coordinator consolidation. No staging, commit, or push performed.
