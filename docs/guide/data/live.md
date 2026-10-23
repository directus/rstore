# Subscriptions

rstore provides a set of methods to help build realtime applications. Plugins can use [the relevant hooks](../plugin/hooks.md#subscriptions) to connect to WebSockets, Server-Sent Events, or any other realtime protocol.

## Subscribe <Badge text="Changed in v0.7" type="warning" />

Subscriptions are a way to listen for data changes. You can subscribe to a specific collection and let plugins update the store in realtime. You can pass the same options you use in [queries](./query.md).

```ts
const store = useStore()

store.ChatMessage.subscribe(q => q({
  params: {
    filter: {
      roomId: 'room1',
    },
  },
}))
```

The subscription follows reactive options and resubscribes when they change. Function-valued options, such as `filter`, are local cache callbacks and are ignored in that comparison: an inline callback rebuilt on each render does not reopen the subscription <Badge text="Changed in v0.9" type="warning" />.

## Unsubscribe

The `subscribe` method returns an object with an `unsubscribe` function. The subscription is also automatically removed when the current component is unmounted.

```ts
const { unsubscribe } = store.ChatMessage.subscribe()

// ...

unsubscribe()
```

## Metadata

Plugins can set metadata information on the `meta` ref returned by `subscribe`:

```ts
const { meta } = store.ChatMessage.subscribe()
console.log(meta.value)
```

## Live Query <Badge text="Changed in v0.7" type="warning" />

Use `liveQuery` to combine query + subscription in one call.

Live queries with `enabled: false` do not subscribe. With reactive options, enabling the query opens its subscription; disabling it closes the subscription. The subscription hook runs after the query has started its first load, so a slow subscribe never delays that load <Badge text="Changed in v0.9" type="warning" />.

```ts
const { data: user } = store.User.liveQuery(q => q.first('some-id'))
```

```ts
const { data: messages } = store.ChatMessage.liveQuery(q => q.many({
  filter: item => item.roomId === 'room1',
  params: {
    filter: {
      roomId: 'room1',
    },
  },
}))
```

### Follow selected pages

By default, only the main page is subscribed. Pass a second argument to follow every existing page or exactly the pages your view displays:

```ts
const currentPageIndex = ref(0)
const query = store.Article.liveQuery(q => q.many({ pageSize: 25 }), {
  pages: () => [currentPageIndex.value],
})

await query.fetchMore({ pageIndex: 1 })
currentPageIndex.value = 1
```

`pages` accepts `'main'` (default), `'all'`, an index array, a ref of indexes, or a getter. Indexes without an existing page are skipped until the page exists. Repeated indexes open only one subscription. This policy stays outside find options and does not change query identity or fetch requests.

Each followed page has its own subscription. Its `findOptions` merge base options with that page's options, including cursor params from `fetchMore`. `pageIndex` identifies the followed page; it is absent for keyed or unpaged queries. `setResult` publishes only that page, and `refresh` always targets that page, even if callers pass a different `pages` list. Use `query.refresh` directly to reload several pages.

Switching the selected indexes closes removed subscriptions. Changed page options replace that page's subscription; changed base options reset pages and close old subscriptions. Function identity alone does not trigger a resubscription: a function-only change reloads pages in place instead of resetting them. Refresh overrides (`query.refresh(options)` or a hook's `payload.refresh(options)`) shape loads only; they never change a subscription's `findOptions`. Disabling or disposing the query closes every page subscription; server queries open none.

Each offset page can be consistent on its own while inserts or deletes shift rows between pages, causing gaps or duplicates across them. Keeping several displayed pages consistent with each other, for example with pinned cursor windows, is not supported yet.

### Connector callbacks <Badge text="New in v0.9" />

This section is for plugin authors. Plugins receive two callbacks in the [subscribe hook](../plugin/hooks.md#subscribe):

- `setResult(result, { meta, version })` publishes a full server-computed result for the followed page without another request. Cached queries reference rows the connector already wrote with `$cache.writeItem` and `fieldTimestamps`; `no-cache` queries display supplied values directly. Use `resultMode: 'responseRefs'` when the server controls membership. Paginated `computed` pages remain cache slices.
- `refresh(options?)` refetches only the followed page when a notification only invalidates its result.

An unversioned push supersedes any pending fetch for that page. An accepted push completes its foreground loading state. Metadata such as `totalCount` merges into query metadata; `$`-prefixed fields are reserved and not accepted in `meta`. For `first`, a pushed `null` displays `null`; the connector handles cache deletion. Plain `subscribe()` subscriptions receive neither callback.

`setResult` returns:

- `'applied'` when the push is accepted. The main page publishes it at once. Another page queues it until the main page has a result, then publishes it; a queued push is still dropped without effects if, before it publishes, the query is disposed or disabled, the page is removed or its options change, a later unversioned push supersedes it (as does, for an unversioned push, a new fetch of the page), or a newer version lands. `'applied'` therefore means accepted, not displayed.
- `'stale'` when the page already holds or has accepted a newer `version`.
- `'inactive'` when the subscription is disposed, disabled, deselected or replaced. Nothing changes.

#### Order server results

Connectors can stamp fetched results with `meta.$resultVersion` and pushed results with `setResult(rows, { version })`. Versions use `FieldTimestampValue`: a finite number or serialized HLC string, compared with Core's `compareHLC`. `setResult` throws for any other format; a fetch with another format logs a warning and counts as unversioned. Each page rejects older versions; equal versions apply. A fetch started before a versioned push can still publish if its result is newer. Rejected fetches complete without replacing page metadata, and rejected pushes return `'stale'`.

`refresh()` retains each page's version. Changing base query options resets page versions. Unversioned results apply without version comparison and clear that page's version; unversioned pushes retain their pending-fetch supersession behavior. A versioned push drops the unversioned result of a fetch that was already in flight, because the two cannot be ordered; fetches started after the push apply. rstore reads `$resultVersion` from fetch metadata and removes it from published query metadata.

Versions order page results, not individual item fields. Cached connectors must still supply `fieldTimestamps` when writing pushed items; `setResult` neither rolls back nor orders writes the connector already made.

## Reconnect Handling

`liveQuery` also refreshes when `realtimeReconnectEventHook` is triggered.

This hook is exported from `@rstore/vue` and is intended for realtime adapters to signal that their transport has recovered after a disconnect. For example, `@rstore/nuxt-drizzle` triggers it after the websocket reconnects and active subscriptions have been re-sent.

If you build a custom realtime plugin, trigger the hook only after the connection is usable again:

```ts
import { definePlugin, realtimeReconnectEventHook } from '@rstore/vue'
import { watch } from 'vue'

export default definePlugin({
  name: 'my-realtime',
  category: 'remote',
  setup() {
    let hasConnected = false

    watch(socketStatus, (status) => {
      if (status === 'OPEN') {
        if (hasConnected) {
          realtimeReconnectEventHook.trigger()
        }
        hasConnected = true
      }
    })
  },
})
```

You can also listen to the hook directly for advanced cases:

```ts
import { realtimeReconnectEventHook } from '@rstore/vue'
import { onScopeDispose } from 'vue'

const query = await store.todos.liveQuery(q => q.many())

const { off } = realtimeReconnectEventHook.on(() => {
  query.refresh()
})

onScopeDispose(off)
```

Avoid triggering it on the initial connect, otherwise `liveQuery` will perform an unnecessary extra refresh.

## Confirmed results

A published `setResult` push confirms its followed page without a fetch. Read `page.confirmed` or `query.confirmed.value` (every existing page) before showing empty states or counts. Cache guesses stay unconfirmed; option changes, cache resets and `$cache.clearCollection` clear confirmation. Local writes preserve it, including membership changes in computed pages. See [confirmed results](./query.md#confirmed-results) for fetch policies, remounts and SSR hydration.
