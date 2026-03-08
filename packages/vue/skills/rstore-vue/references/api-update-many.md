| name | description |
| --- | --- |
| `api-update-many` | Reference for collection `updateMany(items, options?)` |

# updateMany

## Surface

Updates multiple items in batch.

## Syntax

```ts
await store.todos.updateMany([{ id: '1', done: true }, { id: '2', done: true }])
```

## Behavior

- Executes batch update flow and updates cache for returned items.

## Requirements

- Every item should carry resolvable key fields.

## Pitfalls

1. Partial key payloads can produce inconsistent batch behavior.
