| name | description |
| --- | --- |
| `api-create-store` | Reference for `createStore(...)` |

# createStore

## Surface

`createStore({ schema, plugins, ...options }) -> Promise<VueStore>`

## Syntax

```ts
const store = await createStore({
  schema: [todos],
  plugins: [],
})
```

## Behavior

- Wraps core store with Vue proxies and collection APIs.
- Supports optional `cacheStaggering`, `experimentalGarbageCollection`, `findDefaults`, `syncImmediately`.

## Requirements

- `schema` and `plugins` are required.

## Pitfalls

1. Unknown collection access through `$collection` throws at runtime.
