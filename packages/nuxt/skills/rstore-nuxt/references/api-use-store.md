| name | description |
| --- | --- |
| `api-use-store` | Reference for Nuxt auto-imported `useStore()` |

# useStore (`#imports`)

## Surface

Returns injected Nuxt app store instance (`useNuxtApp().$rstore`).

## Syntax

```ts
const store = useStore()
const items = await store.todos.findMany()
```

## Behavior

- Typed aliases are exposed by runtime imports module.
- Depends on runtime plugin setup and injection.

## Requirements

- `@rstore/nuxt` module must be registered.

## Pitfalls

1. Using `useStore` before module/runtime setup leads to missing injection context.
