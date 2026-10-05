| name | description |
| --- | --- |
| `api-cache-hydration` | Reference for Nuxt SSR cache payload hydration (`$srstore`) |

# SSR Cache Hydration

## Surface

Runtime cache serialization/hydration path through `nuxtApp.payload.state.$srstore`.

## Syntax

```ts
// server render hook writes:
nuxtApp.payload.state.$srstore = store.$cache.getState()
```

## Behavior

- Server writes cache state on `app:rendered`.
- Client restores cache state during plugin setup when payload key exists.
- Cache state includes `itemMetadata` namespaces registered with `serialize: true` (the default), such as multiplayer field stamps and tombstones; `setState()` restores them (numeric keys as numbers).

## Requirements

- Use single runtime-owned store instance.

## Pitfalls

1. Creating another store instance in app code bypasses hydrated cache state.
2. Since v0.9 the state carries `itemMetadata` instead of `fieldTimestamps` / `tombstones`; code reading `$srstore` directly must update.
