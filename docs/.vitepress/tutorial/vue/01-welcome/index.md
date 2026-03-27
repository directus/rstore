---
title: Welcome
---

You are building a small Vue todo app, but the bigger goal is to understand how collections, the normalized cache, plugins, queries, mutations, and forms fit together in one coherent data model.

The editor is where you work, the preview is the running app, and validation is the quick check that the current step really hangs together. Some parts of the flow are code-heavy. Some pause to explain a broader piece of the API before you keep building.

```ts
const store = useStore()
const { data: todos } = await store.Todo.query(q => q.many())
```

That line is the destination. The rest of the flow is about making each piece of it feel earned.

## How to use it

Move step by step. Read the text first, inspect the starter file, then implement the idea in your own words. If the preview or validation disagrees with you, that is useful feedback, not a trap. The correction view is there when you want to compare your approach with the expected solution.

## What matters

rstore is local-first and schema-driven. Collections describe your data model. The cache keeps a normalized copy of what the app knows. Queries read from that cache. Mutations, forms, plugins, relations, and live updates all meet there. Everything you build from here keeps returning to that same picture from different angles.
