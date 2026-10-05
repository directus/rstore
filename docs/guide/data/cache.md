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

The state includes the [item metadata](#item-metadata) namespaces registered with `serialize` (the default), such as the field stamps of the multiplayer plugin.

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

## Write metadata <Badge text="New in v0.9" />

Writes, deletes and mutations accept `metadata`: opaque data that the cache forwards to the [`cacheBeforeWriteItem` and `cacheBeforeDeleteItem`](../plugin/hooks.md#cachebeforewriteitem) hooks without reading it. Plugins give it a meaning, for example the field timestamps of the [multiplayer plugin](./collaboration.md#stamped-writes):

```ts
store.$cache.writeItem({ collection, key, item, metadata: { fieldTimestamps } })
store.$cache.writeItems({ collection, items: [{ key, value, metadata: { fieldTimestamps } }] })
store.$cache.deleteItem({ collection, key, metadata: { deletedAt } })
await store.todos.update(item, { metadata: { fieldTimestamps } })
```

Plugins declare their keys by augmenting `CustomCacheWriteMetadata`:

```ts
declare module '@rstore/shared' {
  interface CustomCacheWriteMetadata {
    etag?: string
  }
}
```

In development, the cache warns once per key when a write carries a metadata key that no hook handled (handlers mark keys with `consume()`). It usually means a plugin is missing.

## Item metadata <Badge text="New in v0.9" />

`store.$cache.itemMetadata` stores per-item plugin data beside the cached rows, partitioned by namespace. Reads and writes are synchronous, so cache hooks can use them.

```ts
const metadata = store.$cache.itemMetadata

// Once, usually in the plugin `init` hook
metadata.register('my-plugin:etag', { lifecycle: 'item' })

metadata.write('my-plugin:etag', 'todos', '1', 'W/"42"')
metadata.read('my-plugin:etag', 'todos', '1') // 'W/"42"'
metadata.delete('my-plugin:etag', 'todos', '1')
Array.from(metadata.entries('my-plugin:etag')) // [{ collection, key, value }]
metadata.size('my-plugin:etag')
metadata.namespaces() // [{ name, lifecycle, serialize, persist }]
```

| Option | Default | Description |
| --- | --- | --- |
| `lifecycle` | | `'item'`: removed with the row (delete, garbage collection, `clear`, `clearCollection`). `'detached'`: survives the row (for example a tombstone), removed by `clear`, `clearCollection` or `delete` |
| `serialize` | `true` | Include the namespace in `getState()` and restore it in `setState()`. Numeric keys are restored as numbers |
| `persist` | `false` | Let storage plugins persist it, such as the [offline plugin](./offline.md#persisted-item-metadata). Values must be structured-cloneable |

Registering a namespace again with the same options is a no-op; with other options it throws. Writing to an unregistered namespace throws. Keys follow row identity: `1` and `'1'` address the same entry.

## Apply mutations <Badge text="New in v0.9" />

Use `store.$cache.applyMutation` when an external source gives you an authoritative cache update and you do not want to run the mutation lifecycle. This is useful for realtime subscriptions, sync engines, or replication messages, such as upload events from another client.

```ts
const collection = store.$collections.find(c => c.name === 'files')!

store.$cache.applyMutation({
  collection,
  mutation: 'create',
  result: {
    id: 'file-id',
    filename: 'receipt.pdf',
    mimeType: 'application/pdf',
    size: 123456,
  },
})
```

You can apply `create`, `update`, and `delete` operations. For many operations, pass `results`, `items`, or `keys`:

```ts
store.$cache.applyMutation({
  collection,
  mutation: 'update',
  results: [
    { id: 'file-id-1', uploadStatus: 'processed', thumbnailUrl: '/thumbs/file-id-1.webp' },
    { id: 'file-id-2', uploadStatus: 'processed', thumbnailUrl: '/thumbs/file-id-2.webp' },
  ],
})
```

```ts
store.$cache.applyMutation({
  collection,
  mutation: 'delete',
  keys: ['file-id-1', 'file-id-2'],
})
```

`applyMutation` returns the cache outcome:

```ts
const result = store.$cache.applyMutation({
  collection,
  mutation: 'delete',
  key: 'file-id-1',
})

console.log(result.written, result.deleted, result.skipped)
```

::: warning
`applyMutation` only updates the cache. It does not call `beforeMutation`, `afterMutation`, `beforeManyMutation`, or `afterManyMutation`, and it does not record mutation history. Use [`mutate`](./mutation.md#custom-mutations) for custom remote work that should behave like a rstore mutation.
:::

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
