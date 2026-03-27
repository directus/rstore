---
title: Module Setup
---

This is where the Nuxt integration stops being abstract. Once `@rstore/nuxt` is enabled and your collections are placed where the module can discover them, Nuxt can build the store for you and expose typed helpers automatically.

Start in `nuxt.config.ts` and register `@rstore/nuxt`.

```ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt'],
})
```

Then move into `app/rstore/todos.ts` and `app/rstore/users.ts`. The backend routes already exist. Your job is to describe those records with real collection definitions.

```ts
export default RStoreSchema.withItemType<Todo>().defineCollection({
  name: 'Todo',
  getKey: item => item.id,
  hooks: {
    fetchMany: () => $fetch('/api/todos'),
  },
})
```

Make `Todo` fully readable and writable, and make `User` readable so relations have something real to resolve later.

What makes this feel different from Vue is that `app/rstore` is now a convention Nuxt understands. You describe the collections. The module handles discovery, store creation, typed access, and the rest of the runtime wiring. That is why the app can jump straight into page and component code.
