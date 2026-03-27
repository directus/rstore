---
title: Cache APIs
---

The cache has been underneath every step so far, so it is a good final coding step to touch it directly and make that relationship explicit.

Open `app/components/CachePanel.vue`. The computed read is already showing you the current contents.

```ts
const cachedTodos = computed(() => store.Todo.peekMany())
```

That is a synchronous cache read. No fetching is involved. Now finish the two actions: inject one todo directly into the cache, then clear the whole cache.

```ts
store.Todo.writeItem({
  id: 'cached-manual-item',
  text: 'Injected from writeItem()',
  completed: false,
  assigneeId: 'user-2',
})

store.$cache.clear()
```

The page beside the panel should react immediately, because it is reading that same normalized state.

That is the lesson underneath the lesson. Queries, mutations, relations, and live updates all worked because they met in one place: the cache. There is more to the cache API, including layers, pause/resume, and state hydration, but even this small exercise should make the rest of the app easier to reason about in hindsight.
