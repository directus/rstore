---
title: Welcome
---

This follows the same core rstore ideas as the Vue app, but through Nuxt’s filesystem conventions and module integration. The point is not only to make the app work. It is to make the data model feel clear enough that the surrounding Nuxt features stay easy to reason about.

Most application code lives under `app/`, and the tiny in-memory backend lives under `server/`. That is intentionally close to a real Nuxt project: UI, route-driven pages, server handlers, and framework conventions all in one place.

```ts
const store = useStore()
const { data: todos } = await store.Todo.query(q => q.many())
```

You still end up writing code like that. The difference is that Nuxt can generate more of the plumbing for you once the module and collections are in place.

In plain Vue, you create and install the store yourself. In Nuxt, the module can scan `app/rstore`, create the store, expose a typed `useStore()`, integrate with SSR payloads, and wire into Nuxt DevTools. The next steps make that concrete instead of leaving it as magic.
