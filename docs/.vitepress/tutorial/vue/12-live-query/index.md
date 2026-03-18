---
title: Live Query
---

A normal query reacts when the cache changes, but it does not subscribe to outside events on its own. In this chapter you will close that loop so simulated remote changes flow into the cache and then into the page.

## Upgrade the page and the plugin

In `src/App.vue`, switch the list from `query()` to `liveQuery()`.

```ts
const { data: todos } = await store.Todo.liveQuery(q => q.many())
```

Then open `src/rstore/memoryPlugin.ts` and add the subscribe and unsubscribe hooks.

```ts
const subscriptions = new Map<string, () => void>()

hook('subscribe', ({ collection, subscriptionId, store }) => {
  const stop = memoryBackend.subscribe('todos', (event) => {
    if (event.type === 'delete' && event.key) {
      store.$cache.deleteItem({ collection, key: event.key })
      return
    }
  })

  subscriptions.set(subscriptionId, stop)
})
```

When the event includes an item, write it into the cache with `store.$cache.writeItem(...)`. When the subscription ends, call the saved stop function and remove it from the map.

## Why `liveQuery()` is such a small change

The query API and the cache model stay the same. You are not building a separate real-time system in the component. You are extending the transport layer so it can feed fresh events into the same normalized cache the page already trusts.
