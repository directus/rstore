---
title: Live Query
---

The page already reacts to cache changes. `liveQuery()` keeps that same cache-backed reading model and adds a subscription so outside events can keep the data fresh. That is the only conceptual jump here.

In `app/pages/index.vue`, switch the list to `liveQuery()`.

```ts
const { data: todos } = await store.Todo.liveQuery(q => q.many())
```

Then open `app/rstore/plugins/memory.ts` and add subscription hooks that forward incoming events into the cache.

```ts
const subscriptions = new Map<string, () => void>()

hook('subscribe', ({ collection, subscriptionId, store }) => {
  const stop = subscribeToRemoteTodos((item) => {
    const key = collection.getKey(item)
    if (key == null)
      return

    store.$cache.writeItem({
      collection,
      key,
      item,
    })
  })

  subscriptions.set(subscriptionId, stop)
})
```

Import `subscribeToRemoteTodos` from `../live`, and remember to clean up the saved handler in `hook('unsubscribe', ...)`.

The reason this should feel familiar is that you are not building a second realtime state model for the page. `liveQuery()` still reads from the normalized cache. The only new behavior is that the transport layer keeps feeding that cache when outside events happen.
