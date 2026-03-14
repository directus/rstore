---
title: Collections
---

This first step teaches the smallest useful piece of rstore: a collection. A collection tells the store what one record type looks like and how rstore can fetch or mutate that record type.

## What you are editing

Edit `src/rstore/schema.ts`. The file already defines `TodoCollection` and `UserCollection`, plus the item types used by the rest of the tutorial.

## What is missing

The Todo collection can fetch a single record with `fetchFirst`, but it cannot fetch a list yet. That is why the preview cannot show the seeded todos.

## Step by step

1. Find the `hooks` object inside `TodoCollection`.
2. Add a `fetchMany` hook next to `fetchFirst`.
3. Return the full in-memory todo list with `memoryBackend.list('todos')`.
4. Leave the rest of the file alone. The key function, mutation hooks, and `UserCollection` are already correct.

## Why this matters

When a component later calls `store.Todo.query(q => q.many())`, rstore will look for the collection hook that knows how to fetch many Todo records. Without `fetchMany`, the query has no list data to load.

## Check your work

The step passes when the preview can render the three seeded todos. If nothing appears, double-check that the hook name is exactly `fetchMany` and that it points at the `todos` collection in the memory backend.

## Reference

If you want the broader API surface, open the collection reference docs from the header link.
