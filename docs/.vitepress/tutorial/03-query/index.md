---
title: Query
---

This step replaces temporary local state with rstore's reactive query API. The goal is to let the component read Todo records directly from the store.

## What you are editing

Edit `src/App.vue`. The template is already ready to render a list and a refresh button.

## What is missing

The starter component keeps its own empty `todos` array and a dummy `refresh()` function. That means the UI never talks to rstore.

## Step by step

1. Import `useStore` from `@rstore/vue`.
2. Remove the manual `ref` state for `todos` and `loading`.
3. Create the store instance with `const store = useStore()`.
4. Use async setup to run `await store.Todo.query(q => q.many())`.
5. Destructure the result into `data: todos`, `loading`, and `refresh`.
6. Keep the existing `watchEffect` so the preview can keep observing the rendered list.

## Why this matters

`query(...)` gives you reactive data backed by the normalized cache. When the cache changes later in the tutorial, this component will stay in sync without managing a second copy of the todo list by hand.

## Check your work

The preview should show all seeded todos and the refresh button should still call the query's `refresh` function. If you see template errors, make sure `todos` and `loading` are the refs returned by the query result.
