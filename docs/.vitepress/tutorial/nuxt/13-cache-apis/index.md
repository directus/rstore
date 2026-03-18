---
title: Cache APIs
---

The cache is the beating heart of the tutorial, so this last chapter lets you touch it directly. It is a good way to end because it makes every earlier chapter easier to reason about in hindsight.

## Read and write the cache on purpose

Open `app/components/CachePanel.vue`. The computed read is already showing you the current contents.

```ts
const cachedTodos = computed(() => store.Todo.peekMany())
```

Now finish the two actions: inject one Todo directly into the cache, then clear the whole cache.

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

## The lesson underneath the lesson

Queries, mutations, live updates, and relations all worked because they were meeting in one place: the cache. Direct cache APIs are powerful because they let you work at that level on purpose. They also remind you to treat the cache carefully, because it is real application state.
