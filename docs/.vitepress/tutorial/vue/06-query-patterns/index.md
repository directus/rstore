---
title: Query Patterns
---

The list step gives you the happy-path version of reading data. rstore goes quite a bit further, and it helps to know where those extra APIs fit before you keep building.

## `query`, `find`, and `peek`

Use `query()` when the UI should stay reactive and participate in loading, refresh, and fetch-policy behavior.

Use `findFirst()` or `findMany()` when you want an imperative fetch and do not need a long-lived reactive wrapper.

Use `peekFirst()` or `peekMany()` when you want a synchronous cache read with no fetching at all. Direct cache reads come back later.

## The options that matter most

A few options show up often:

- `enabled` lets you disable a query until some condition is ready.
- dependent queries are just a pattern built on `enabled`
- `include` asks plugins to fetch related records when needed
- pagination uses `pageIndex`, `pageSize`, and `fetchMore()`
- fetch policy controls whether the query prefers cache, network, or a mix of both

The important part is that these are all refinements of the same reading model you already used in `App.vue`. You are not learning a second system later, only more ways to shape the same one.
