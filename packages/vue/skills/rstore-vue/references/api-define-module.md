| name | description |
| --- | --- |
| `api-define-module` | Reference for `defineModule(name, cb)` |

# defineModule

## Surface

Creates a store-scoped reusable module factory.

## Syntax

```ts
const useTodosModule = defineModule('todos-module', ({ store }) => ({
  list: () => store.todos.findMany(),
}))
```

## Behavior

- Caches module instance per store (`$modulesCache`).
- Reads store from injection context or explicit/active store.

## Requirements

- Run in setup context or provide store.

## Pitfalls

1. Missing store context causes runtime throw.
