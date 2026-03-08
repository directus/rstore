| name | description |
| --- | --- |
| `api-params-where` | Reference for deprecated `params.where` |

# params.where (deprecated)

## Surface

Legacy filter location kept for compatibility; prefer `findOptions.where`.

## Syntax

```ts
await store.todos.findMany({
  params: {
    where: eq('status', 'open'),
  },
})
```

## Behavior

- Marked deprecated in runtime type augmentation.
- Still read by runtime fetch/cache hooks for backward compatibility.
- Can override `findOptions.where` in some spread-based payload builders.

## Requirements

- Use only for legacy call sites that cannot be migrated immediately.

## Pitfalls

1. Mixing `params.where` and `findOptions.where` leads to ambiguous filter precedence.
