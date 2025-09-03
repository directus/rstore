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

## Clear cache

Clearing the cache is useful when you want to remove all items from the cache. This can be used for example to reset the store to its initial state after the user logs out.

```ts
store.$cache.clear()
```

You can listen to the `afterCacheReset` hook in plugins or use `store.$onCacheReset` to listen to the event when the cache is cleared.

```ts
store.$onCacheReset(() => {
  console.log('Cache cleared')
})
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

You can also use the `store.<modelName>.writeItem` method:

```ts
store.User.writeItem({
  id: 'abc',
  name: 'John Doe',
  email: 'john@acme.com',
})
```

To write multiple items at once, you can use the `writeItems` method:

```ts
const model = store.$getModel(items[0])
const writes = items.map(item => ({
  key: model.getKey(item),
  value: item,
}))
store.$cache.writeItems({
  model,
  items: writes,
})
```

## Delete items

Deleting items from the cache is useful when you want to remove items that are no longer needed. This can be used for example to remove items that are no longer in the store.

```ts
const model = store.$getModel(item)
const key = model.getKey(item)
store.$cache.deleteItem({
  model,
  key,
})
```

You can also use the `store.<modelName>.clearItem` method:

```ts
store.User.clearItem('abc')
```

## Layers

A cache layer is a way to create a temporary state modification that can be easily reverted. This is how [optimistic updates](./mutation.md#optimistic-updates) are implemented.

To create a new layer, use the `addLayer` method:

```ts
store.$cache.addLayer({
  id: 'some-layer-id',
  state: {
    Messages: {
      'some-message-id': {
        $overrideKey: 'some-message-id',
        text: 'This is an optimistic message',
      },
    },
  },
  deleteItems: {},
  optimistic: true, // Optional
  prevent: { // Optional
    update: false,
    delete: false,
  },
  skip: false, // Optional
})
```

In this example, the layer will override the `text` property of the `Messages` item with id `some-message-id`.

::: tip
If the layer contains records that do not exist in the cache, it will act as if those records were created.
:::

```ts
store.$cache.addLayer({
  id: 'some-layer-id',
  state: {},
  deleteItems: {
    Messages: new Set(['some-message-id']),
  },
})
```

In this second example, the layer will delete the `Messages` item with id `some-message-id`.

::: tip
If multiple layers, they are applied in the order they were added.
:::

To get a layer, use the `getLayer` method:

```ts
const layer = store.$cache.getLayer('some-layer-id')
```

To remove a layer, use the `removeLayer` method:

```ts
store.$cache.removeLayer('some-layer-id')
```

It will effectively rollback all the changes applied by the layer.
