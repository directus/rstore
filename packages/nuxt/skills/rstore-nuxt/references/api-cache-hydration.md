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

## Requirements

- Use single runtime-owned store instance.

## Pitfalls

1. Creating another store instance in app code bypasses hydrated cache state.
