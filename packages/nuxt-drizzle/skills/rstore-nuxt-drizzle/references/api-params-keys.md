| name | description |
| --- | --- |
| `api-params-keys` | Reference for `params.keys` |

# params.keys

## Surface

Restricts `findMany` to a known set of collection keys.

## Syntax

```ts
await store.todos.findMany({
  params: {
    keys: ['1', '2', '3'],
  },
})
```

## Behavior

- Server builds an `OR` key condition from collection primary keys.
- Used by offline sync to check which loaded keys still exist remotely.

## Requirements

- Values must use the same key format as collection `getKey` (including `::` for composite keys).

## Pitfalls

1. Key format mismatches silently yield empty result sets.
