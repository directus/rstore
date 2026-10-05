| name | description |
| --- | --- |
| `api-item-metadata` | Reference for `store.$cache.itemMetadata` |

# store.$cache.itemMetadata

Per-item plugin data stored beside cached rows, partitioned by namespace.

## Surface

`store.$cache.itemMetadata` with `register`, `write`, `read`, `delete`, `entries`, `size`, `namespaces`.

## Syntax

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

## Behavior

- Reads and writes are synchronous, so cache hooks can use them.
- `lifecycle: 'item'`: entry removed with the row (delete, garbage collection, `clear`, `clearCollection`).
- `lifecycle: 'detached'`: entry survives the row (for example a tombstone); removed by `clear`, `clearCollection` or `delete`.
- `serialize` (default `true`): namespace included in `getState()` and restored by `setState()` (SSR); numeric keys restored as numbers.
- `persist` (default `false`): storage plugins such as the offline plugin persist the namespace.
- Keys follow row identity: `1` and `'1'` address the same entry.

## Requirements

- Register a namespace before writing to it.
- `persist: true` values must be structured-cloneable.
- Custom `Cache` implementations must implement `itemMetadata`.

## Pitfalls

1. Writing to an unregistered namespace throws.
2. Registering again with the same options is a no-op; with different options it throws.
3. `getState()` exposes `itemMetadata` (not `fieldTimestamps` / `tombstones` as before v0.9); code reading the payload directly must use it.
