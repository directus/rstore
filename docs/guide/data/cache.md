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
const collection = store.$getCollection(item)
const key = collection.getKey(item)
store.$cache.writeItem({
  collection,
  key,
  item,
})
```

You can also use the `store.<collectionName>.writeItem` method:

```ts
store.User.writeItem({
  id: 'abc',
  name: 'John Doe',
  email: 'john@acme.com',
})
```

To write multiple items at once, you can use the `writeItems` method:

```ts
const collection = store.$getCollection(items[0])
const writes = items.map(item => ({
  key: collection.getKey(item),
  value: item,
}))
store.$cache.writeItems({
  collection,
  items: writes,
})
```

## Delete items

Deleting items from the cache is useful when you want to remove items that are no longer needed. This can be used for example to remove items that are no longer in the store.

```ts
const collection = store.$getCollection(item)
const key = collection.getKey(item)
store.$cache.deleteItem({
  collection,
  key,
})
```

You can also use the `store.<collectionName>.clearItem` method:

```ts
store.User.clearItem('abc')
```

## Layers <Badge text="New in v0.7" />

A cache layer is a way to create a temporary state modification that can be easily reverted. This is how [optimistic updates](./mutation.md#optimistic-updates) are implemented.

To create a new layer, use the `addLayer` method:

```ts
store.$cache.addLayer({
  id: 'some-layer-id',
  collectionName: 'Messages',
  state: {
    'some-message-id': {
      $overrideKey: 'some-message-id',
      text: 'This is an optimistic message',
    },
  },
  deleteItems: new Set(),
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
  collectionName: 'Messages',
  state: {},
  deleteItems: new Set(['some-message-id']),
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

## Pause & Resume

When your application receives multiple cache updates in quick succession (for example, from a WebSocket connection), this can cause UI flickering as Vue re-renders for each individual update. To prevent this, you can pause cache updates and resume them later:

```ts
// Pause cache updates
store.$cache.pause()

// Perform multiple operations
store.$cache.writeItem({ collection, key: 1, item: item1 })
store.$cache.writeItem({ collection, key: 2, item: item2 })
store.$cache.deleteItem({ collection, key: 3 })

// Resume and apply all queued updates at once
store.$cache.resume()
```

When the cache is paused:
- All write operations (`writeItem`, `writeItems`, `deleteItem`) are queued
- All layer operations (`addLayer`, `removeLayer`) are queued
- Read operations (`readItem`, `readItems`) still work and return the current (pre-pause) state

When `resume()` is called:
- All queued operations are applied in the order they were received
- Vue will only re-render once after all updates are applied
