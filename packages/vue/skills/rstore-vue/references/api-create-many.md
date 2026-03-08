| name | description |
| --- | --- |
| `api-create-many` | Reference for collection `createMany(items, options?)` |

# createMany

## Surface

Creates multiple items in one mutation call.

## Syntax

```ts
await store.todos.createMany([{ title: 'A' }, { title: 'B' }])
```

## Behavior

- Runs batch create mutation flow and writes results.

## Requirements

- Batch payload should align with collection schema and key logic.

## Pitfalls

1. Per-item error handling may need explicit adapter/plugin strategy.
