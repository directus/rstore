---
title: Cache APIs
---

The query API should be your default, but every other step has already been relying on the same cache underneath. This final coding step makes that visible on purpose.

Open `src/components/CachePanel.vue`. The computed read is already there:

```ts
const cachedTodos = computed(() => store.Todo.peekMany())
```

That line is doing a synchronous cache read. No fetching, no loading state, no network. Now fill in the two actions that write directly to the same store state.

```ts
store.Todo.writeItem({
  id: 'cached-manual-item',
  text: 'Injected from writeItem()',
  completed: false,
  assigneeId: 'user-2',
})

store.$cache.clear()
```

One action injects a complete record. The other wipes the cache. The important observation is that the rest of the app reacts immediately because those views were already reading from the same normalized state.

There is more to the cache API, including layers, pause/resume, and direct state hydration. You do not need all of that here. What matters is understanding that the cache is not a side feature. It is the center of the system you have been using all along.
