| name | description |
| --- | --- |
| `api-define-plugin` | Reference for `definePlugin({...})` |

# definePlugin

## Surface

Defines a store plugin with lifecycle hooks.

## Syntax

```ts
const plugin = definePlugin({
  name: 'remote',
  category: 'remote',
  setup({ hook }) {
    hook('fetchMany', async payload => payload.setResult([]))
  },
})
```

## Behavior

- Hooks into fetch/cache/mutation/subscription/sync lifecycles.
- Can set collection defaults via `addCollectionDefaults`.

## Requirements

- Use stable plugin names and clear categories.

## Pitfalls

1. Non-deterministic hook behavior makes cache/query results unstable.
