# S10: six inspector read views

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Depends on: S03, S05, S09.
- Owner: migrate inspector reads to DTOs.
- Contract: [overview](./00-overview.md).

## Outcome

Collections, Cache, History, Subscriptions, Modules, and Plugins render same bounded data for Core, Vue, Node, and SSR targets.

## Files

Migrate existing files under `packages/devtools/app/`:

- `components/devtools/{Collections,CollectionItem,CollectionRelation}.vue`.
- `components/devtools/{Cache,CacheToolbar,CacheCollectionList,CacheCollectionItem,CacheItemList,CacheItemRow}.vue`.
- `components/devtools/{History,HistoryItem,Subscriptions,Subscription}.vue`.
- `components/devtools/{Modules,ModuleItem,Plugins,PluginItem}.vue`.
- `components/devtools/{VirtualList,ResultPopover}.vue`, `CodeSnippet.vue` where useful.
- Replace `composables/{rstore,cache,cache-view,plugins,stats}.ts` with DTO-aware modules or remove when unused.
- Create `stores/views.ts`, `components/preview/PreviewValue.vue`, `PreviewEntries.vue`, `preview.ts`.
- Extend `test/browser/devtoolsInspector.spec.ts` and shared fixture.
- Create `packages/devtools/test/inspector-views.spec.ts` for selection/pagination state.

Shared connection store from S09 is sole source of target and transport. Existing `time.ts` can remain if neutral; migrate dates from epoch metadata explicitly.

## View contract

Collections show declared names, relations, virtual status, and operation capabilities. Cache counts derive from producer inspection, not rendered-page length. Unsupported custom cache shows unavailable state.

Cache lists collections, effective items, and layers separately. Search/filter is declarative and validated by producer; no `eval` or user function predicate. Filters apply before pagination. Row keys include key type; numeric `0` and string `"0"` remain distinct.

Preserve typed displayed key; do not invent separate cache identities when cache canonicalizes equivalent keys. If 10,000-row scan cap truncates search, show incomplete result state and unknown matching total; never present bounded sample as complete collection search.

History displays operation metadata, bounded input/result/error previews, sequence, dropped count, and captured time. Initial load shows newest available page in chronological order; pagination uses stable sequence boundary rather than array index. Clear is implemented S11.

Subscriptions show actual captured subscriptions and unavailable fields without starting subscriptions. Modules display bounded values and callable metadata without invocation controls. Plugins show public descriptors, not whole plugin object/function sources.

SSR views display recorded-at time and recorded/read-only state. Missing captured section is unavailable, not empty success.

## Preview rendering

One recursive renderer consumes S03 tagged union. Preserve explicit distinctions for object, array, bigint, Date, map/set, function metadata, Error, reference, accessor, unsupported, and truncation.

Escape text through Vue rendering. No `v-html` for untrusted values; if existing highlighter needs HTML, confine it to trusted escaped code path or replace with safe token rendering.

Keep expansion local and bounded; expanding does not fetch arbitrary full objects. Labels distinguish omitted entries/bytes from actual empty object/array. Show producer limits concisely, without explanatory filler.

Virtualize long visible lists using existing component if suitable. Pagination controls represent server limits and total/unknown totals truthfully. No recursive rendering of live Vue objects.

## Implementation sequence

1. Replace tab data access one tab at a time; begin Collections then Cache.
2. Implement preview renderer once before History/Modules.
3. Migrate subscriptions/plugins; remove all private cache and Nuxt-state reads from client.
4. Add per-tab read parameters and request cancellation through S09 dispatcher.
5. Widen client tsconfig to all migrated views; retire unreachable legacy composables.
6. Keep destructive controls hidden/disabled until S11 binds real shared executor.

## Tests first

Real browser fixture includes actual Core and Vue stores, relations, optimistic layer, error history, realtime subscriptions, module ref, and plugin descriptors.

- All six tabs show expected data and update after real producer event.
- Core and Vue target switching changes data without late-response contamination.
- Cache filter excludes before pagination; keys remain distinct.
- History initial/newer/older pages preserve sequence and dropped-state labels.
- Preview cycles/truncation render without crash or unescaped HTML.
- Custom cache unavailable differs from empty cache.
- SSR recorded target renders supported snapshots without action capability.
- Module callable preview never invokes member.

Run `pnpm test:browser devtoolsInspector --project headless` and focused state tests. Screenshots can aid manual visual review; no screenshot-only proof or presentation class tests.

## Exit gate

Six tabs work through DTO transport. Client contains no live store assumptions, private layers, Nuxt DevTools bridge, or executable filter. Background-only selection/status design respected.

## Implementation receipt

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Changed files: `components/devtools/ReadViews.vue`, recursive `components/preview/PreviewValue.vue`, shared query/view state; old live-store/private-cache composables and components removed.
- Tests demonstrated failing before implementation: no isolated rendering fault campaign performed. Browser generation replacement initially failed and passed after S07 registry notification repair; stale reads and session-only selection have separate focused regressions.
- Commands and results: focused query/selection/action suites, 13 tests pass; client Vue typecheck and scoped repository ESLint pass; client Vite build passes.
- Browser evidence for six tabs: initial dedicated headless matrix passed twelve scenarios; final rebuilt matrix passed thirteen using actual built SPA, real Core/Vue stores and connector. Collections rendered relations, History rendered actual connector error, Subscriptions displayed real subscription ID, Modules reflected live Vue state change, Plugins displayed public `fake-remote` descriptor, Cache showed real selected store rows. Custom nested Node host read actual producer cache after OTP authentication. Screenshot for visual review: `/tmp/rstore-devtools-inspector.png`.
- DTO safety: shared `validateReadResult` validates target, sections and reply budget before rendering. Tagged previews use escaped Vue text, no HTML execution or live store objects. Recorded request metadata uses same bounded preview renderer.
- Limitations / follow-up: new real retained SSR browser scenario passed against final rebuilt library/client. Browser acceptance does not yet exercise every cycle/truncation/filter pagination permutation; bounded projection and query algorithm tests supply separate coverage. Do not interpret query-reset units as complete producer scan proof.

## Final coordinator acceptance

- Slice evidence: Final actual browser matrix verified six views, selected cache rows, actual history errors, Vue module updates, escaped previews, target replacement, and retained SSR records after source cache disposal. No-store failure request metadata remained selectable. Real Core/cache and query/history algorithm suites separately cover effective/committed layers, bounded filtering, and paging; no exhaustive browser pagination campaign is claimed.
- Final aggregate gates: `pnpm test` passed 267 files / 1,980 tests; one distribution file / four cases conditionally skipped in default run, then all four passed against final v4 tarballs outside monorepo. Final headless browser matrix passed 13 cases in 6.9 seconds. Seven real Nuxt boot files passed, including final SSR lifecycle/privacy and browser/disabled/production scenarios.
- Final tooling gates: all 21 workspace typecheck scripts plus integration/browser types passed through serial `pnpm test:types`; full repository ESLint passed; shared/Core/Vue/devtools builds and Nuxt module build passed serially; docs build passed. Nine current guide snippets passed strict final-v4 installed declarations without aliases or `skipLibCheck`. After last inherited-getter guard repair, affected devtools library/client typechecks, rebuilt artifact, full suite, browser matrix, and installed consumers were rerun successfully; full workspace types and lint had already passed with unchanged public API. See S16 for external ambient-type boundaries.
- Failure-first tests and private fault probes preserved. Source owners confirmed freeze before coordinator consolidation. No staging, commit, or push performed.
