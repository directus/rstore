---
title: Live Query
---

A normal query reacts when the cache changes, but it does not create a subscription by itself. `liveQuery()` keeps the same cache-backed reading model and adds the subscription piece on top. That is the only new idea here.

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
    }
  })

  subscriptions.set(subscriptionId, stop)
})
```

When the event includes an item, write it into the cache with `store.$cache.writeItem(...)`. When it represents a deletion, remove the item from the cache. The component should not grow a second realtime state model.

That is why `liveQuery()` is such a small code change for the page. The query API stays familiar because the cache model stays familiar. You are extending the transport layer so outside events can keep feeding the same normalized state the UI already trusts.
