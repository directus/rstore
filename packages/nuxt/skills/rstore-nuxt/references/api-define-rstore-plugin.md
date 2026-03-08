| name | description |
| --- | --- |
| `api-define-rstore-plugin` | Reference for `defineRstorePlugin(...)` auto-import |

# defineRstorePlugin

## Surface

Nuxt auto-import alias for `@rstore/vue` `definePlugin`.

## Syntax

```ts
export default defineRstorePlugin({
  name: 'my-plugin',
  category: 'processing',
  setup(ctx) {},
})
```

## Behavior

- Auto-imported as the `@rstore/vue` `definePlugin` alias.
- Keeps plugin authoring syntax explicit in Nuxt app/layer code.

## Requirements

- Follow `@rstore/vue` plugin semantics and hook lifecycle contracts.

## Pitfalls

1. Nuxt aliasing does not change plugin behavior; scope/category mistakes still apply.
