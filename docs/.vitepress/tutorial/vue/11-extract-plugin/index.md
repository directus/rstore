---
title: Extract a Plugin
---

Collection-local hooks were a great way to get started, but you can feel the duplication now. This chapter is about pulling transport behavior into one reusable plugin so the schema can go back to describing data shape.

## Move transport into `memoryPlugin.ts`

Open `src/rstore/memoryPlugin.ts` and give the plugin a way to figure out which backend path a collection wants.

```ts
function getPath(collection: { meta?: { path?: string } }) {
  return collection.meta?.path as 'todos' | 'users' | undefined
}
```

Once you have that helper, the plugin can answer fetches and mutations for any collection that declares a `meta.path`.

```ts
hook('fetchMany', ({ collection, setResult }) => {
  const path = getPath(collection)
  if (!path) return
  setResult(memoryBackend.list(path))
})
```

At the same time, clean up `src/rstore/schema.ts` so the collections describe identity, metadata, and form shape instead of repeating transport logic.

## What changes in the mental model

Plugins are where you centralize policy. Collections say “this is a Todo” and “its transport path is `todos`.” The plugin says “here is how any collection with a path fetches and mutates data.” That separation keeps bigger apps maintainable.
