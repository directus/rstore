| name | description |
| --- | --- |
| `api-cache-before-write-item` | Reference for the `cacheBeforeWriteItem` plugin hook |

# cacheBeforeWriteItem

Intercepts a write before it reaches committed cache state.

## Surface

`hook('cacheBeforeWriteItem', payload => void)` inside `definePlugin({ setup })`.

## Syntax

```ts
hook('cacheBeforeWriteItem', ({ collection, key, existing, incoming, metadata, setValue, skip, consume }) => {
  // Drop stale writes of a versioned row
  if (metadata?.version != null && existing?.version > metadata.version) {
    consume('version')
    return skip()
  }
  // Or replace the stored row
  setValue({ ...existing, ...incoming })
})
```

## Behavior

- Called for `writeItem`, every item of `writeItems`, mutation results and relation children.
- Runs inside the queued cache flush (`pause()`/`resume()` keep order) and sees the committed row without optimistic layers.
- `existing`: committed row before the write (frozen), or `undefined`.
- `incoming`: incoming scalar fields (relation fields split off).
- `metadata`: write metadata of the write.
- `setValue(row)`: replace the whole stored row; indexes follow. Last call wins.
- `skip()`: drop the write (no state change, no relation child write, no `afterCacheWrite`); wins over `setValue`.
- `consume(...keys)`: mark metadata keys handled (silences the development warning).

## Requirements

- Handlers must be synchronous.
- Custom `Cache` implementations must call this hook.

## Pitfalls

1. Mutating `existing` fails: it is frozen; build a new row and pass it to `setValue`.
2. Forgetting `consume()` leaves the development "unhandled metadata key" warning.
