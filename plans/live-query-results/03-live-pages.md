# S03: live pages

- Status: verified; implemented on 2026-10-23, landed in `4dd1de55`.
- Depends on: S01, S02.
- Owner: which pages of a live query are subscribed.
- Contract: [overview](./00-overview.md).

## Outcome

A paginated live query can follow pages other than its main page. Each followed page gets its own subscription, with its page options, a page-scoped `refresh` and a page-scoped `setResult`. Pages that stop being followed, or are dropped, unsubscribe.

## API

```ts
store.Article.liveQuery(q => q.many({ pageSize: 25 }), {
  /** Default 'main'. A getter is reactive. */
  pages: 'main' | 'all' | MaybeRefOrGetter<number[]>,
})
```

- `'main'` is today's behavior.
- `'all'` follows every page in `pages.value`.
- An array follows exactly those page indexes that exist in `pages.value`; an index without a page is skipped until the page exists.
  - Example: `useItems`-style table views pass `() => [currentPageIndex]` and get page 1 alone on page 1.
- The second argument is not part of find options, so it doesn't enter `queryId`, fetch options or subscription comparison (locked decision 4).

## Semantics

1. **Subscription options.** One subscription per followed page index. Its `findOptions` are `getPageOptions(ctx, page)`: base options plus the page's own (`pageIndex`, cursor params from `fetchMore`). The payload carries `pageIndex`.
2. **Scoped refresh.** `refresh(options)` is `query.refresh({ ...options, pages: [pageIndex] })`.
3. **Scoped setResult.** S02 publishing targets that page.
4. **Reconcile on change.** Watch the followed index set and the page options.
   - Subscribe new indexes and unsubscribe removed ones.
   - Resubscribe a page whose options changed.
   - All of it is serialized through the same queue as today's `subscribeToApiQuery`, so no subscription is orphaned.
5. **Option resets.** When base options change, `loadMainPage` resets pages. Every page subscription reconciles against the new pages; none survives with old options.
6. **Main page.** It is followed by the same mechanism. The existing main subscription is the `'main'` case, so there is one code path, not two.
7. **Function equality.** The subscription equality check compares options with functions ignored (`deepEqual` with a custom comparator). A consumer's callback can then live in options without causing a resubscription. This closes the current Monospace `liveRefresh` workaround.
8. **Server and disabled queries.** No page subscriptions on the server. `enabled: false` unsubscribes them all (S01 guard).

## Files

- `packages/vue/src/api/query.ts`: split `subscribeToApiQuery` into a single-subscription unit and a page set manager. Keep `subscribe()` (plain) on the single unit.
- New `packages/vue/src/api/livePages.ts` if `query.ts` grows past about 300 lines.
- `packages/vue/src/api/types.ts`, `createCollectionApi.ts`: `liveQuery` second argument type.
- `packages/shared/src/types/hooks/realtime.ts`: `pageIndex` on the payload.
- Tests: new `packages/vue/test/integration/query/live-pages.spec.ts`; add API type cases to `query-public-api.test-d.ts`.

## Tests first

- **Default:** one subscription with the main page options, as today.
- **Pages shown:**
  - With `pages: () => [current]` and `current = 1` after `fetchMore({ pageIndex: 1 })`, exactly one subscription exists. Its `findOptions.pageIndex` is 1 and its `pageIndex` is 1.
  - Switching back to 0 unsubscribes page 1 and subscribes page 0.
- **`'all'`:** fetching three pages yields three subscriptions; an options change resets them to the new main page only.
- **Scoped publishing:** a page subscription's `setResult` changes only its page, and its `refresh` refetches only its page (`fetchMany` call carries its `pageIndex`).
- **Function options:** options that only change a function's identity don't resubscribe.
- **Teardown:** rapid page switches leave exactly the expected subscriptions (`remote.subscriptions()`), with no orphans after scope dispose.

## Exit gate

New spec, existing subscription and pagination suites, types and docs pass. Docs explain that offset pages are each consistent on their own but can shift relative to each other. For lists showing several pages at once, they point to S06.

## Implementation receipt

- Status: verified; implementation and acceptance gates completed on 2026-10-23. No staging, commit or push. Existing S01/S02 and unrelated working changes preserved.
- Changed files:
  - New `packages/vue/src/api/livePages.ts`: page selection and reconciliation for default `'main'`, `'all'`, and reactive index arrays/getters; skips missing pages and deduplicates indexes. Merges options through existing `getPageOptions`, scopes callbacks to each page, and shares one serialized transport queue. Owns detached per-page effect scopes and releases them on removal/disposal. Batches temporary page-array resets during refresh so retained subscriptions do not churn. Guards delivery synchronously against selection, base options, page options, page identity and disposal. Preserves one reactive metadata object across page hooks and result publication.
  - `packages/vue/src/api/query.ts`: main live queries now use the same page manager. Retains the single-subscription unit for both plain subscriptions and page scopes; adds shared queue/metadata/active-window inputs. Uses one custom `fast-equals` comparator that ignores function identity, preserving subscription generation when only callbacks change. Resolves payload page indexes from current options/defaults while omitting them for first/unpaged queries. File remains 282 lines; manager is 129 lines.
  - `packages/vue/src/api/{types,createCollectionApi}.ts`: exported `LiveQueryOptions` and optional second `liveQuery` argument, separate from find options.
  - `packages/shared/src/types/hooks/realtime.ts`: optional subscribe payload `pageIndex` and page-scoped callback documentation.
  - `packages/core/src/subscription/subscribe.ts`: additive `pageIndex` input/forwarding. This small prerequisite is necessary to deliver the new Shared payload through Core; no query/CRDT behavior changed.
  - New `packages/vue/test/integration/query/live-pages.spec.ts`: 14 scenarios using real Vue/store/cache lifecycle with shared `createVueStack` and FakeRemote. Covers main indexes 0/2, missing/duplicate selected indexes, switching back, all three pages, cursor params, base resets, page option replacement, scoped publishing/refresh, held response supersession, function identity, held subscribe/rapid switches/disposal, disabled/server queries, resolved pagination defaults, keyed/unpaged payloads, and reactive metadata shared across followed pages.
  - `packages/vue/test/query-public-api.test-d.ts`: valid literal/array/ref/getter policy types, invalid policy/index types, and optional numeric hook `pageIndex`.
  - `docs/guide/data/{live,query}.md`, `docs/guide/plugin/hooks.md`: policy usage, merged page options, scoped callbacks, lifecycle, and independent offset-page limitations with S06 pinned-window follow-up.
  - `packages/vue/skills/rstore-vue/{SKILL.md,references/api-live-query.md,references/api-query.md,references/api-subscribe.md}` and `SKILLS-GENERATION.md`: incremental documentation-derived skill update. Dependency copies remain generated by prepack/sync-skills; README has no duplicated page API reference to update.
  - This plan: updated status and implementation receipt; removed the existing invalid ellipsis placeholder from the API snippet for Markdown lint.
- Failing-first evidence:
  - Before source changes, `pnpm exec vitest run --project integration packages/vue/test/integration/query/live-pages.spec.ts`: **8 failed, 1 passed**. Default payload lacked `pageIndex`; selected missing pages still opened the main subscription; `'all'` had `[0]` instead of `[0, 1, 2]`; function-only changes unsubscribed; rapid selection switches did not subscribe the selected page. Log: `/tmp/rstore-s03-failing-first.log`.
  - Existing subscription recovery regression initially failed after manager extraction: a disposed per-page scope skipped an intermediate queued subscribe, leaving the final selection to consume the scripted failure. Retaining/updating the single-subscription unit for an existing page restores ordered recovery. Logs: `/tmp/rstore-s03-first-green.log`, `/tmp/rstore-s03-recovery.log`.
  - Additional metadata regression first failed with expected `12`, received `undefined` after connector metadata mutation: result publication had replaced the query's metadata object. Stable reactive metadata sharing fixes it. Log: `/tmp/rstore-s03-focused.log`.
  - Additional resolved-defaults regression failed with expected page index `0`, received `undefined`; payload index now uses resolved pagination options. Log: `/tmp/rstore-s03-defaults-red.log`.
  - Isolated fault probe in `/tmp/rstore-s03-probe-virfzx2_`: correct-source scoped publishing scenario **passed**; changing the publisher target from `followed.page` to `query.mainPage` **failed** on page 1 data (`Two` instead of `Pushed two`). Probe uses copied sources/tests/helpers, private Vite cache and node_modules directories with external dependency links. Shared checkout and dependency trees were not mutated. Logs: `/tmp/rstore-s03-probe-baseline.log`, `/tmp/rstore-s03-probe-wrong-page.log`.
- Commands and results:
  - Used installed Node **26.2.0** on `PATH` with standalone pnpm. Initial mise shim attempt failed with `Read-only file system`; standalone pnpm warns about its embedded Node 20 while child commands use installed Node 26.
  - `pnpm exec vitest run --project unit packages/vue/test/public-exports.spec.ts`: **1 file / 1 test passed**. Log: `/tmp/rstore-s03-unit.log`.
  - `pnpm exec vitest run --project integration packages/vue/test/integration/query/live-pages.spec.ts packages/vue/test/integration/subscriptions.spec.ts packages/vue/test/integration/pagination.spec.ts packages/vue/test/integration/query/pushed-results.spec.ts packages/vue/test/integration/query/pagination-results.spec.ts packages/vue/test/integration/query/resolved-pagination.spec.ts packages/vue/test/integration/query/mixed-policy-pagination.spec.ts`: **7 files / 66 tests passed**. Log: `/tmp/rstore-s03-focused-final.log`. Integration specs use their configured integration project; compile-time API cases run through `test:types`.
  - First `pnpm test:types` found stale Shared declarations for new payload `pageIndex`. `pnpm --filter @rstore/shared build`, `pnpm --filter @rstore/core build`, and `pnpm --filter @rstore/vue build`: **passed**. Logs: `/tmp/rstore-s03-build-{shared,core,vue}.log`. A subsequent check found only new fixture metadata typing, fixed by explicitly typing the custom count metadata.
  - Final `pnpm test:types`: **passed**, including workspace package scripts and root integration/browser checks. Log: `/tmp/rstore-s03-types-final.log`.
  - `pnpm exec eslint` on all changed source/test files, guide files and `SKILLS-GENERATION.md`: **passed**. Log: `/tmp/rstore-s03-lint-final.log`. Generated canonical skill files are ignored by default; explicit `pnpm exec eslint --no-ignore` on the four changed canonical skill files also **passed**. Log: `/tmp/rstore-s03-skills-lint.log`.
  - `pnpm docs:build` outside sandbox: **passed**, including page rendering. Existing bundle-size and Tailwind plugin warnings remain. Log: `/tmp/rstore-s03-docs.log`.
  - `pnpm test` outside sandbox: **286 files / 2,089 tests passed; 1 file / 4 tests conditionally skipped**. Log: `/tmp/rstore-s03-full.log`.
  - `pnpm exec eslint plans/live-query-results/03-live-pages.md`: **passed** after removing the existing snippet ellipsis and an extra receipt blank line. Log: `/tmp/rstore-s03-receipt-lint.log`.
  - `git diff --check`: **passed**. Final code/test review found no duplicated helper implementations, presentation assertions, or unrelated edits; changed source/test files stay below 300 lines.
- Limitations / follow-ups:
  - Tests prove query/cache/reactive-scope behavior against the shared stateful fake remote, not external connector interoperability.
  - Each offset page is consistent independently; inserts/deletes can shift rows across windows and cause gaps/duplicates across displayed pages. S06 owns the pinned cursor-window design; none implemented here.
  - Result versions/order and confirmation remain S04/S05. `stale` remains reserved by S02; item timestamps and tombstones unchanged.
  - Four distribution tests require `RSTORE_DISTRIBUTION_ROOT` / `RSTORE_DISTRIBUTION_PEERS_ROOT` and remain skipped in the default suite. No requested command was left unrun; no S03 blocker remains.

## Review fixes

- One shared `equalFindOptions` / `toSerializableOptions` (`query/options.ts`) ignores function values everywhere: options watcher, page subscriptions, plain `subscribe()`, push currency and confirmation. A function-only change reloads pages in place instead of resetting them.
- Refresh overrides live in private `page._refreshOptions`; subscriptions follow `getPageIdentityOptions` (base plus page options), so a refresh never changes subscription `findOptions`, and `mainPage.options` only keeps a refreshed `pageIndex`.
- The live query subscribes after the query is created, so its first load starts before the subscribe hook runs.
- Out of plan, kept for a separate decision: the per-page teardown retry queue (`api/subscriptionQueue.ts`), which retains a failed unsubscribe for retry without blocking other pages.
- Cleanup: overlapping teardown specs merged into `subscription-teardown.spec.ts`; user docs no longer link S06.
