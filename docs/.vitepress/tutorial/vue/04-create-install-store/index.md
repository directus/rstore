---
title: Create and Install the Store
---

The schema exists now, but Vue still does not have a store instance. This is the handoff from “the model is defined” to “the app can actually call `useStore()`”.

Open `src/rstore/index.ts`. `setupRstore()` should create the store from the schema and then register `RstorePlugin` on the real Vue app instance.

```ts
const store = await createStore({
  schema,
})

app.use(RstorePlugin, { store })
```

Keep the created store in a local variable and pass that value into `RstorePlugin`. Type augmentation alone is not enough. Components need the actual runtime store to be installed.

This split is deliberate. `createStore()` builds the data engine. The framework plugin exposes that engine to Vue. Plugins, collection defaults, and other store-wide behavior are configured at the `createStore()` layer, while components stay focused on app behavior.
