---
title: Create and Install the Store
---

Now the schema knows about your data, but Vue still has no store instance to inject. This chapter is the handoff from “types on disk” to “a running app can call `useStore()`”.

## Wire the store into Vue

Open `src/rstore/index.ts`. You want `setupRstore()` to create the store and install the plugin on the real app instance.

```ts
const store = await createStore({
  schema,
})

app.use(RstorePlugin, { store })
```

The important move is keeping the created store in a local variable and passing it to `RstorePlugin`. Without that, the components can import the type augmentation, but the runtime app still has nothing to inject.

## Why this matters

rstore separates store creation from framework integration on purpose. `createStore()` builds the data engine. `RstorePlugin` makes it available to Vue components. That split is what lets the same core ideas work across Vue, Nuxt, and other integrations.
