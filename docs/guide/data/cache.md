# Cache

In some cases it's useful to interact with the cache directly.

## State

The cache state can be used to save the current state of the store. This is useful for SSR to rehydrate the client with state serialized in the server, or to load offline data saved locally.

```ts
// Save the current state of the store on the server
const state = store.$cache.getState()
```

```ts
// Restore the state of the store on the client
store.$cache.setState(state)
```

## Write items

Writing items to the cache is useful when you want to update the store with data that is not coming from a query. This can be used for example to add items from a websocket connection.

```ts
const model = store.$getModel(item)
const key = model.getKey(item)
store.$cache.writeItem({
  model,
  key,
  item,
})
```

<!-- ## Clear

```ts
store.$cache.clear() -->
```
