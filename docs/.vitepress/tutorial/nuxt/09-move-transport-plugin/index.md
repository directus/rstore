---
title: Move Transport into app/rstore/plugins
---

Your collections work, but the transport code is starting to repeat itself. This chapter is about letting the collection describe the model while a plugin describes how that model talks to the backend.

## Split the responsibilities

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
  if (!path) return
  setResult(await $fetch(`/api/${path}`))
})
```

Once the plugin handles create, update, and delete as well, the collection file becomes much easier to scan.

## Why this pattern scales

Schema files should tell you what the data is. Plugins should tell you how the app behaves around that data. When you keep those jobs separate, you can share transport policy across many collections without turning the schema into a tangle of repeated hooks.
