---
title: Local-First Mental Model
---

Before you create the store, it helps to line up the app with the language rstore uses everywhere else.

rstore is not a request-state helper that happens to cache things on the side. The normalized cache is the center of the system. Queries read from it. Mutations write through it. Relations resolve from it. Live updates feed into it. That is why the UI can stay simple even as the data flow gets richer.

## Why the app feels reactive

When you call `query()`, the component is reading a computed view of cache state. The backend still matters, but mostly as the place that fills or updates that cache. Reads in the component are local-first by design.

That is also why later steps will feel smaller than the features they represent. A create mutation, a relation lookup, and a subscription event all look different at the edge of the app, but they become useful for the UI in the same place.

## Where transport fits in

Collections define the model. Hooks or plugins define how data gets in and out. It starts with collection-local hooks because they are easy to see in one file, then later moves that transport logic into a plugin once the duplication becomes obvious.

If you want the full conceptual version, spend time in [About rstore](/guide/learn-more), especially the sections on cache, local-first behavior, and plugins. The next step turns that mental model into a real store instance.
