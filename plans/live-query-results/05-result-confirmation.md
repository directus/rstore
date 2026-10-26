# S05: result confirmation

- Status: shipped in `4dd1de55` (docs `6fc9b58e`). Optional; Monospace doesn't use it.

## Outcome

Queries and pages expose whether the shown result was confirmed by the server for the current options, so UIs can show empty states, "not found" and counts only once they are true.

## API

```ts
import { computed } from 'vue'

declare const store: any

const query = store.Todo.query((q: any) => q.many({ fetchPolicy: 'cache-and-fetch' }))
const showEmpty = computed(() => query.confirmed.value && query.data.value.length === 0)
const firstPageConfirmed = computed(() => query.pages.value[0]?.confirmed)
```

- `page.confirmed`: readonly boolean.
- `query.confirmed`: readonly ref, true when every existing page is confirmed; holes don't count.

## Semantics

- **Confirms:** a fetch that reached the server (Core returned a `fetchPromise`), including the background half of `cache-and-fetch`, empty lists and missing items; a published `setResult` push; a `cache-first` hit on a saved page ref recorded as confirmed for the same effective options.
- **Doesn't confirm:** cache-only reads, cache-first hits without saved confirmation, the cache half of `cache-and-fetch`, failed fetches.
- **Drops confirmation:** a change of effective options (checked on read, before the reload starts, refresh overrides included); a disabled query; `$onCacheReset` (which also refreshes); `$cache.clearCollection` of the query's collection (no refetch; `no-cache` pages keep it).
- **Kept:** local cache writes, including membership changes in `computed` pages; refreshes with unchanged options; function-only option changes. Options compare serializable values only, so a rebuilt inline callback after re-render, remount or hydration keeps confirmation.
- **Saved refs.** `pageRefs` entries store `confirmed` and `effectiveOptions`. A remount within the cache lifetime reuses them only when effective options match; refs without provenance are ignored. `no-cache` values are not saved.
- **SSR.** `$cache.getState()` serializes detached `pageRefs`; `setState()` restores them, so a hydrated query with the same effective options shows the server page confirmed, without a client fetch. Older payloads without `pageRefs` stay unconfirmed until fetched or pushed.
- **Privacy.** The fetch confirmation flag is kept in a module `WeakMap` (`query/confirmation.ts`), not in hook metadata.

## Files

- `packages/vue/src/query/{confirmation,page,load,createQuery,types}.ts`.
- `packages/vue/src/api/query.ts`: `markFetchConfirmation` from Core's `fetchPromise`.
- `packages/vue/src/cache/{types,api,reset,queryState}.ts`: `CachedPageRefs`, serialization, hydration, invalidation.

## Tests

- `packages/vue/test/integration/query/confirmation.spec.ts`: fetch policies, pushes, option changes, remount, cache reset, `clearCollection`, SSR.
- `confirmation-provenance.spec.ts`, `page-ref-provenance.spec.ts`.
- `packages/vue/test/query-public-api.test-d.ts`.

## Notes

- Confirmation means the server confirmed these options, not that later local writes cannot change a `computed` page's rows or count. Use `resultMode: 'responseRefs'` for server-controlled membership.
- Saved query results, `pageRefs` included, are bounded by `queryStateRetention` since `4e1ca8b2`.
