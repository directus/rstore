---
title: Live Query
---

The page already reacts to cache changes. Now you are going to give it a source of fresh events so remote-style updates can flow into that same cache automatically.

## Connect the page to live updates

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
    if (key == null) return

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

## Why this feels familiar

You are not building a second read model for live data. `liveQuery()` still reads from the normalized cache. The only new idea is that the transport layer can keep feeding that cache when outside events happen.
