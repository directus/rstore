---
title: Plugin Setup
---

Collection hooks are fine for a small demo, but repeated transport code becomes hard to maintain. This step moves fetch and mutation behavior into an rstore plugin.

## What you are editing

Edit `src/rstore/schema.ts` and `src/rstore/memoryPlugin.ts`.

## What is already done

The schema already switched from collection-local hooks to `meta.path` values such as `'todos'` and `'users'`. The store setup already installs the plugin.

## Step by step

1. In `memoryPlugin.ts`, keep the plugin created with `definePlugin({ name, setup })`.
2. Inside `setup`, keep the `init` hook and report that plugin transport is active.
3. Add a helper such as `getPath(collection)` that reads `collection.meta?.path`.
4. Implement `fetchFirst` and `fetchMany` hooks that call the memory backend for the right path.
5. Implement mutation hooks for create, update, and delete so they route through the same backend.
6. Keep the schema focused on collection shape and metadata only; do not move transport logic back into `schema.ts`.

## Why this matters

Plugins let multiple collections share one transport layer. The collection describes the data shape, while the plugin decides how fetches and mutations reach the backend.

## Check your work

The list should still load, and the preview should report plugin transport mode. If the list disappears, confirm that every hook reads the collection path correctly.
