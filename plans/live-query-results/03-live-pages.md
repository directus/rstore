# S03: live pages

- Status: shipped in `4dd1de55` (docs `6fc9b58e`).

## Outcome

A paginated live query can follow pages other than its main page. Each followed page has its own subscription with its page options, `pageIndex`, and page-scoped `refresh` and `setResult`. Pages that stop being followed unsubscribe.

## API

```ts
import { ref } from 'vue'

declare const store: any

const currentPageIndex = ref(0)
const query = store.Article.liveQuery((q: any) => q.many({ pageSize: 25 }), {
  // 'main' (default) | 'all' | number[] | Ref<number[]> | () => number[]
  pages: () => [currentPageIndex.value],
})
```

- `'main'` follows the main page; `'all'` every existing page; an index list exactly those indexes that exist. Missing indexes are skipped until the page exists; duplicates open one subscription.
- `LiveQueryOptions` is a second argument, not a find option.

## Semantics

- **Subscription options.** Each subscription's `findOptions` are `getPageIdentityOptions`: base options plus the page's own options (`pageIndex`, cursor params from `fetchMore`), never refresh overrides. `pageIndex` is absent for `first` and unpaged queries; pagination resolved from find defaults still reports it.
- **One path.** The main page uses the same page manager (`api/livePages.ts`); the `'main'` policy is a selection of one.
- **Reconciliation.** A watcher on the selection subscribes new pages, closes removed or replaced ones, and resubscribes a page whose options changed. A base-options reset drops every page subscription but the reset main page. A refresh's temporary page-array reset is batched, so retained pages don't churn.
- **Ownership.** Callbacks check ownership synchronously (selection, page identity, base and page options, disposal), so old callbacks return `'inactive'` before queued teardown runs.
- **Serialization.** All page subscriptions of a query share one transport queue (`api/subscriptionQueue.ts`). A failed unsubscribe is retained and retried on the next transition without blocking other pages.
- **Function options.** `equalFindOptions` / `toSerializableOptions` (`query/options.ts`) ignore function values everywhere: options watcher, page subscriptions, plain `subscribe()`, push currency and confirmation. A function-only change reloads pages in place.
- **Refresh overrides.** Kept in each page's private `_refreshOptions` and used by later loads and pushes, never subscription identity; `mainPage.options` only keeps a refreshed `pageIndex`.
- **Lifecycle.** Disabling or disposing the query closes every page subscription; server queries open none.

## Files

- `packages/vue/src/api/livePages.ts`: page selection and reconciliation.
- `packages/vue/src/api/subscription.ts`: single subscription unit shared with plain `subscribe()`.
- `packages/vue/src/api/subscriptionQueue.ts`: serialized queue with teardown retry.
- `packages/vue/src/api/{query,types,createCollectionApi}.ts`: `liveQuery` second argument, `LiveQueryOptions`.
- `packages/vue/src/query/{options,page,refresh}.ts`: option identity and refresh overrides.
- `packages/shared/src/types/hooks/realtime.ts`: `pageIndex` on the payload.

## Tests

- `packages/vue/test/integration/query/live-pages.spec.ts`
- `subscription-teardown.spec.ts`, `subscription-ownership.spec.ts`, `live-query-meta.spec.ts`, `live-page-refresh.spec.ts`
- `packages/vue/test/query-public-api.test-d.ts`: policy and `pageIndex` typing.

## Notes

- Offset pages are each consistent on their own, but inserts and deletes shift rows between them, so several displayed pages can show gaps or duplicates. Pinned cursor pages have no runtime API; S06's proposal was rejected ([ADR](./adr-pinned-cursor-pages.md)). Docs' "not supported yet" describes that current absence, not a scheduled feature.
