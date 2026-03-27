---
title: Move Transport into app/rstore/plugins
---

The collection files work, but they are starting to carry transport policy that really belongs somewhere more reusable.

In `app/rstore/todos.ts`, keep the collection focused on identity, metadata, and form schema. The transport should move behind `meta.path`.

```ts
export default RStoreSchema.withItemType<Todo>().defineCollection({
  name: 'Todo',
  getKey: item => item.id,
  meta: {
    path: 'todos',
  },
})
```

Then open `app/rstore/plugins/memory.ts` and use that path to answer fetches and mutations.

```ts
hook('fetchMany', async ({ collection, setResult }) => {
  const path = getPath(collection)
  if (!path)
    return
  setResult(await $fetch(`/api/${path}`))
})
```

Once the plugin handles create, update, and delete as well, the collection file becomes much easier to scan.

That separation is what makes plugins scale. Collections say what the data is. Plugins say how the app behaves around that data. The same surface can also handle collection defaults, scope-based federation, local-first fallbacks, or more advanced remote adapters.
