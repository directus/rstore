---
title: Cache
---

The final step shows that you can interact with the normalized cache directly when you need a synchronous read or an immediate local write.

## What you are editing

Edit `src/components/CachePanel.vue`. The component already creates the store instance and exposes a computed `cachedTodos` value.

## What is missing

The two button handlers are empty, so the panel never writes to or clears the cache.

## Step by step

1. Keep the cache-only read as `computed(() => store.Todo.peekMany())`. That part is already correct.
2. Keep the existing cache status helper so the preview can show the latest count and flags.
3. In `injectCachedTodo`, call `store.Todo.writeItem(...)` with a complete Todo record.
4. After the write, report `injected: true`.
5. In `clearCache`, call `store.$cache.clear()`.
6. After clearing, report `cleared: true`.

## Why this matters

Cache helpers are useful when you need a synchronous snapshot of known data, optimistic writes, or a full reset. They operate on the same normalized store that powers queries and live queries.

## Check your work

The smoke test will inject one todo and then clear the cache. The rendered count should react immediately to both operations.
