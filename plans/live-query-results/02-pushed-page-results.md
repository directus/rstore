# S02: pushed page results

- Status: shipped in `4dd1de55` (docs `6fc9b58e`); push lane timestamps fixed in `740913b6`.

## Outcome

A realtime connector that receives a server-computed result publishes it with `payload.setResult(result, { meta })`. The page shows it as if a fetch had returned it, without a request, and any older in-flight fetch of that page is superseded.

## API

```ts
import { definePlugin } from '@rstore/vue'

export default definePlugin({
  name: 'push-realtime',
  category: 'remote',
  setup({ hook }) {
    hook('subscribe', ({ store, collection, setResult }) => {
      onPush((rows: any[], totalCount: number) => {
        for (const item of rows)
          store.$cache.writeItem({ collection, key: collection.getKey(item)!, item })
        setResult?.(rows, { meta: { totalCount } })
      })
    })
  },
})

declare function onPush(cb: (rows: any[], totalCount: number) => void): void
```

- `result` is parsed rows: an array for `many`, an item or `null` for `first`.
- `meta` is `PublicHookMeta`: `$`-prefixed fields are excluded from the type.
- Returns `SetResultOutcome`: `'applied'` (accepted), `'stale'` (S04), `'inactive'`.

## Semantics

- **Inactive.** Returns `'inactive'` without effects when the query is disposed or disabled, the page was removed, or the subscription no longer owns the page (deselected, resubscribed with new options, collection replaced).
- **Supersession.** An unversioned push gives the page a new `requestId`, so a fetch in flight cannot publish its result, metadata or error; rows it wrote are collected if unowned. A later unversioned push supersedes an earlier queued one.
- **Representation.** Shared with fetches (`applyPageResult`): `no-cache` shows the values as data, `responseRefs` and unpaged `computed` reference cached rows, paginated `computed` pages stay cache slices. A `first` push of `null` shows `null`; the connector deletes the item itself.
- **Refresh overrides.** `push.ts` resolves `getPageOptions`, including retained `_refreshOptions`: overrides shape later pushes as well as loads, without changing subscription `findOptions` (`docs/guide/plugin/hooks.md`).
- **Metadata.** Merged into query metadata like fetch metadata (`updateQueryMeta`), for example `totalCount`.
- **Loading state.** The push settles the page's in-flight lane slots, completes the foreground lane, clears the page's background error and stamps query and page `lastUpdated` with one timestamp.
- **Tracking.** With query tracking, page ownership follows the pushed rows, including `include` relations; rows that left are released, not deleted.
- **Main-page barrier.** The main page publishes before `setResult` returns. Other pages queue the push until the main page has a result (`query/publication.ts`): the barrier opens per main load and is released when that load settles or a pushed main result lands; waiters follow a replacement main load. A queued push pins its rows under a dedicated tracking id until it publishes or is dropped, and is rechecked for ownership before publishing. `'applied'` therefore means accepted, not displayed.
- **Reentrancy.** A nested accepted publication from a synchronous observer supersedes the rest of the outer one (`query/publicationOwnership.ts`).
- **Shared metadata.** A live query copies its initial metadata into one reactive object shared by all its page subscriptions, so publications never mutate another query's cache entry.

## Files

- `packages/shared/src/types/hooks/realtime.ts`: `SetResultOutcome`, `SetResultOptions`, `SetSubscriptionResult`.
- `packages/vue/src/query/push.ts`: `publishPageResult`.
- `packages/vue/src/query/{page,representation,result,state,publication,publicationOwnership}.ts`: shared publication path, ownership, lanes, barrier.
- `packages/vue/src/query/createQuery.ts`: private `_setPageResult` handle.
- `packages/vue/src/query/absence.ts`: absence tracking for `first` nulls (see Notes).

## Tests

- `packages/vue/test/integration/query/pushed-results.spec.ts`
- `queued-pushed-results.spec.ts`, `main-publication.spec.ts`, `pushed-results-reentrancy.spec.ts`, `result-publication-ownership.spec.ts`
- `pushed-fetch-settlement.spec.ts`, `pushed-page-errors.spec.ts`
- `absence-ownership.spec.ts`, `negative-first-results.spec.ts`

All under `packages/vue/test/integration/query/`; shared setup in `packages/vue/test/utils/live-query.ts`.

## Notes

- Added beyond the plan: absence tracking. A fetched or pushed `first` miss stays `null` until a committed write to that key (or collection, when unkeyed) could change the answer; optimistic layers show immediately but a rollback restores the miss.
- `setResult` never writes items. A rejected push cannot undo cache writes the connector already made.
