---
title: Welcome
---

This track covers the same rstore ideas as the Vue version, but through Nuxt’s filesystem conventions. The good news is that you still get a real running app, a preview, and validation. The difference is where the pieces live and how much the Nuxt module can do for you.

## Get your bearings

Most application code in this track lives under `app/`, and the tiny tutorial backend lives under `server/`. That mirrors how a real Nuxt project tends to feel: UI and data conventions on one side, server routes on the other.

```ts
const store = useStore()
const { data: todos } = await store.Todo.query(q => q.many())
```

You will still end up writing code like that. The interesting part is that Nuxt can generate more of the plumbing once the module and collections are in place.

## What is different in Nuxt

In plain Vue, you had to create and install the store yourself. In Nuxt, the module can discover files in `app/rstore`, create the store, and expose a typed `useStore()` automatically. The next chapter is where that clicks into place.
