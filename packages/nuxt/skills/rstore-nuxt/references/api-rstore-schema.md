| name | description |
| --- | --- |
| `api-rstore-schema` | Reference for `RStoreSchema` auto-import |

# RStoreSchema

## Surface

Helper object exposing schema builders for Nuxt auto-import usage.

## Syntax

```ts
const todos = RStoreSchema.withItemType<Todo>().defineCollection({
  name: 'todos',
})
```

## Behavior

- Contains `{ withItemType, defineRelations }` from `@rstore/vue`.
- Useful when you prefer a namespaced schema API surface in Nuxt files.

## Requirements

- Use the same collection/relation contracts as base Vue skill APIs.

## Pitfalls

1. `RStoreSchema` is a thin wrapper object, not a separate schema runtime.
