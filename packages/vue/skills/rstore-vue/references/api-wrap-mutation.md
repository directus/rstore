| name | description |
| --- | --- |
| `api-wrap-mutation` | Reference for `store.$wrapMutation(fn)` |

# $wrapMutation

## Surface

Wraps mutation function and exposes telemetry fields.

## Syntax

```ts
const save = store.$wrapMutation(async () => {
  await store.todos.create({ title: 'x' })
})
await save()
console.log(save.$loading, save.$error, save.$time)
```

## Behavior

- Tracks loading/error/duration on wrapped callable.

## Requirements

- Use for imperative mutation telemetry when form object is unnecessary.

## Pitfalls

1. Wrapping side-effect-heavy functions without error handling can hide root causes.
