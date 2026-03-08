| name | description |
| --- | --- |
| `api-find-first` | Reference for collection `findFirst(...)` |

# findFirst

## Surface

One-shot async read for first matching item.

## Syntax

```ts
const item = await store.todos.findFirst({ key: '1' })
```

## Behavior

- Uses fetch policy and plugin hooks through core query pipeline.
- Returns wrapped item or `null`.

## Requirements

- Query options must match collection key/filter contracts.

## Pitfalls

1. Result is not a reactive query object; use `query` for persistent reactive state.
