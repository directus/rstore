---
title: Store Setup
---

Now that the schema can describe data, Vue still needs an actual rstore instance. This step wires the store into the app so components can call `useStore()`.

## What you are editing

Edit `src/rstore/index.ts`. The file already imports the schema and a small preview status helper.

## What is missing

The starter code creates a store and throws the result away. It also never installs `RstorePlugin` on the Vue app, so `useStore()` is unavailable inside components.

## Step by step

1. Import `RstorePlugin` from `@rstore/vue`.
2. Change `setupRstore` so it receives the real `app` instance instead of ignoring the argument.
3. Await `createStore({ schema })` and store the result in a local `store` variable.
4. Install the plugin with `app.use(RstorePlugin, { store })`.
5. Update the existing preview status helper so `storeReady` becomes `true`.

## Why this matters

`createStore()` builds the runtime store, but Vue components still need the plugin to inject it. Once the plugin is installed, any component can call the typed `useStore()` helper declared at the bottom of the file.

## Check your work

When the step is correct, the preview starts rendering the todo list instead of staying in the “store not ready” state. If it still fails, make sure you both created the store and called `app.use(...)`.
