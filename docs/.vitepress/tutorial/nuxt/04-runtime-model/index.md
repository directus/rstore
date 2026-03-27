---
title: Nuxt Runtime Model
---

Nuxt does more for you than Vue here, but it is still useful to know what work the module is actually taking off your hands.

Once `@rstore/nuxt` is enabled, the module scans `app/rstore` for collections and `app/rstore/plugins` for plugins. It creates the store, exposes a typed `useStore()`, integrates with SSR payload transfer, and wires the rstore panel into Nuxt DevTools.

That means a page or component can usually stay close to business logic:

```ts
const store = useStore()
const { data: todos } = await store.Todo.query(q => q.many())
```

There is still a real store underneath that line. Nuxt is just moving the bootstrap work into conventions so your application code can stay focused. If you later need to reason about where a collection or plugin comes from, start by looking in `app/rstore`.
