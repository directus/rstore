| name | description |
| --- | --- |
| `api-define-rstore-module` | Reference for `defineRstoreModule(...)` auto-import |

# defineRstoreModule

## Surface

Nuxt auto-import alias for `@rstore/vue` `defineModule`.

## Syntax

```ts
export const useTodos = defineRstoreModule('todos', ({ store }) => ({
  list: () => store.todos.findMany(),
}))
```

## Behavior

- Auto-imported as the `@rstore/vue` `defineModule` alias.
- Provides per-store module caching through base Vue module behavior.

## Requirements

- Requires available active/injected store context when invoked.

## Pitfalls

1. Calling outside setup context without active store throws just like `defineModule`.
