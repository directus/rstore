---
title: Extract a Plugin
---

Collection-local hooks were the right way to start because they made the data flow visible. They are no longer the right way to continue, because the transport logic is repeating.

Open `src/rstore/memoryPlugin.ts` and give the plugin a small helper to discover which backend path a collection wants.

```ts
function getPath(collection: { meta?: { path?: string } }) {
  return collection.meta?.path as 'todos' | 'users' | undefined
}
```

Once you have that helper, the plugin can answer fetches and mutations for any collection that declares a `meta.path`.

```ts
hook('fetchMany', ({ collection, setResult }) => {
  const path = getPath(collection)
  if (!path)
    return
  setResult(memoryBackend.list(path))
})
```

At the same time, clean up `src/rstore/schema.ts` so the collections go back to describing identity, metadata, and form shape instead of transport details.

That separation is one of the most important patterns in rstore. Collections answer “what is this data?” Plugins answer “how does this app move that data around?” The same plugin surface also scales to collection defaults, scope-based federation, and more advanced transport pipelines later on.
