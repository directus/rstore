---
title: Cache APIs
---

The query API should be your default, but sometimes you need to inspect or patch the cache directly. This last chapter lets you feel that power in a tiny, safe sandbox.

## Work directly with the cache

Open `src/components/CachePanel.vue`. The computed read is already there:

```ts
const cachedTodos = computed(() => store.Todo.peekMany())
```

Now fill in the two actions.

```ts
store.Todo.writeItem({
  id: 'cached-manual-item',
  text: 'Injected from writeItem()',
  completed: false,
  assigneeId: 'user-2',
})

store.$cache.clear()
```

One action should inject a complete Todo record, and the other should wipe the cache so the rest of the app reacts immediately.

## What to remember

The cache is not a separate side feature. It is the heart of what your queries are reading. That is why direct cache writes show up instantly, and that is also why you should use them deliberately: they are powerful because they operate on the same normalized state as everything else.
