| name | description |
| --- | --- |
| `api-cache-before-delete-item` | Reference for the `cacheBeforeDeleteItem` plugin hook |

# cacheBeforeDeleteItem

Intercepts a row removal before it happens.

## Surface

`hook('cacheBeforeDeleteItem', payload => void)` inside `definePlugin({ setup })`.

## Syntax

```ts
hook('cacheBeforeDeleteItem', ({ collection, key, existing, metadata, skip, consume }) => {
  if (metadata?.keepRow) {
    consume('keepRow')
    skip()
  }
})
```

## Behavior

- Called before `deleteItem` and delete mutations remove a row.
- `skip()` keeps the row; `consume(...keys)` marks metadata keys handled.

## Requirements

- Custom `Cache` implementations must call this hook.

## Pitfalls

1. Evictions, `clear` and `clearCollection` are not intercepted.
