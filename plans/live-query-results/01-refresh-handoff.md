# S01: refresh handoff

- Status: shipped in `4dd1de55` (docs `6fc9b58e`).

## Outcome

The subscribe hook of a live query receives `refresh(options?)`, which refetches the page the subscription follows. A disabled live query doesn't subscribe.

## API

```ts
import { definePlugin } from '@rstore/vue'

export default definePlugin({
  name: 'invalidation-realtime',
  category: 'remote',
  setup({ hook }) {
    hook('subscribe', ({ refresh }) => {
      // On an invalidation message without a result:
      void refresh?.({ resultMode: 'responseRefs' })
    })
  },
})
```

`refresh` takes `QueryRefreshOptions` (`@rstore/shared`): find option overrides plus `pages` and `prune`. `VueQueryRefreshOptions` aliases it.

## Semantics

- Only live queries get `refresh`; plain `subscribe()` payloads don't.
- Scoped to the followed page (S03): the main page refreshes through `query.refresh` with `pages: [page.index]`; any other page reloads alone. A caller-supplied `pages` or `pageIndex` cannot redirect it.
- Overrides persist in the page's private `_refreshOptions` and shape later loads and pushes (`getPageOptions` in `push.ts`); they never change the subscription's `findOptions`. This matches `docs/guide/plugin/hooks.md`.
- `{ resultMode: 'responseRefs' }` replaces membership with the server response while keeping rows other queries own in the cache.
- A callback whose subscription no longer owns its page resolves without refetching.
- `enabled: false` closes every page subscription and opens none until the options are enabled again. Server-side queries never subscribe.
- `realtimeReconnectEventHook` still refreshes every live query.

## Files

- `packages/shared/src/types/query.ts`: `QueryRefreshOptions`.
- `packages/shared/src/types/hooks/realtime.ts`: `refresh` on the `subscribe` payload.
- `packages/core/src/subscription/subscribe.ts`: forwards `refresh`, `setResult`, `pageIndex`.
- `packages/vue/src/api/subscription.ts`: single subscription unit, disabled guard in `subNow`, inactive-callback guard.
- `packages/vue/src/query/refresh.ts`: `getMainPageRefreshOptions`, `refreshSecondaryPage`.

## Tests

- `packages/vue/test/integration/subscriptions.spec.ts`: disabled live queries, reconnect refresh and SSR subscription guard.
- `packages/vue/test/integration/query/main-page-refresh.spec.ts`: refresh refetches, `responseRefs` membership with shared rows retained, page-redirection guard and retained overrides (including later pushes).
- `packages/vue/test/integration/query/live-page-refresh.spec.ts`: secondary-page refresh, cursor identity and retained overrides.
- `packages/vue/test/integration/query/pushed-results.spec.ts`: plain subscriptions receive neither `refresh` nor `setResult`.
- `packages/vue/test/query-public-api.test-d.ts`: `refresh({ pages })` typing.
