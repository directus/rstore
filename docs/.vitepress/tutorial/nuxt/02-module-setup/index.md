---
title: Module Setup
---

This chapter is the Nuxt payoff chapter. Once the module is enabled and the collections are discoverable, Nuxt can assemble the store for you and expose a typed `useStore()` without a hand-written setup file.

## Turn on the module and define the collections

Start in `nuxt.config.ts` and register `@rstore/nuxt`.

```ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt'],
})
```

Then move into `app/rstore/todos.ts` and `app/rstore/users.ts`. The tutorial backend routes already exist, so your job is to describe those records with real collection definitions.

```ts
export default RStoreSchema.withItemType<Todo>().defineCollection({
  name: 'Todo',
  getKey: item => item.id,
  hooks: {
    fetchMany: () => $fetch('/api/todos'),
  },
})
```

Make `Todo` fully readable and writable, and make `User` readable so the relation chapter has something to work with later.

## Why Nuxt feels different here

With the module turned on, `app/rstore` becomes a convention Nuxt understands. You describe the collections, and the module handles store creation, discovery, and typed access. That is why later chapters can jump straight into page and component code.
