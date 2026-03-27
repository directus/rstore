---
title: Query Patterns
---

Before you wire the page itself, it is worth placing the upcoming `query()` call inside the broader query API.

Use `query()` when the UI should stay reactive and track loading, refresh, and fetch policy.

Use `findFirst()` or `findMany()` for imperative reads when you do not want to keep a reactive wrapper around the result.

Use `peekFirst()` or `peekMany()` when you want a synchronous cache read with no fetch at all.

A few options show up often in real apps:

- `enabled` for disabled or dependent queries
- `include` when related records should be fetched alongside the primary collection
- pagination through `pageIndex`, `pageSize`, and `fetchMore()`
- fetch policies for choosing between cache-preferred and network-preferred reads

The important part is that these are all variations on the same reading model. The page only needs the simple case, but the rest of the API is extending the same idea rather than switching to a different one.
