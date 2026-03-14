---
title: Live Query
---

A normal query reacts to cache updates, but it does not automatically subscribe to remote changes. This step upgrades the tutorial to a live query backed by plugin subscriptions.

## What you are editing

Edit `src/App.vue` and `src/rstore/memoryPlugin.ts`.

## What is missing

The component still uses `query(...)`, and the plugin does not subscribe to backend events yet. The simulated remote insert therefore never reaches the store cache.

## Step by step

1. In `App.vue`, replace `store.Todo.query(q => q.many())` with `store.Todo.liveQuery(q => q.many())`.
2. In `memoryPlugin.ts`, create a `Map` to store unsubscribe handlers by `subscriptionId`.
3. Add a `subscribe` hook that only handles the Todo path.
4. Inside that hook, call `memoryBackend.subscribe('todos', callback)`.
5. In the callback, write incoming items into the cache with `store.$cache.writeItem(...)`.
6. If the event is a delete, remove the item with `store.$cache.deleteItem(...)`.
7. Save the stop function in the map, then add an `unsubscribe` hook that looks it up, calls it, and removes it from the map.

## Why this matters

`liveQuery` is the bridge between backend subscriptions and reactive components. Once the plugin pushes remote events into the cache, every live query updates without a manual refresh.

## Check your work

Use the “Simulate remote todo” control in the preview. The new todo should appear automatically. If it does not, make sure both the query type and the plugin subscription hooks were updated.
