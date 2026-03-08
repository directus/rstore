| name | description |
| --- | --- |
| `api-delete-many` | Reference for collection `deleteMany(keysOrItems, options?)` |

# deleteMany

## Surface

Deletes multiple items by keys or payloads.

## Syntax

```ts
await store.todos.deleteMany(['1', '2'])
```

## Behavior

- Runs batch delete mutation flow.
- Clears matching cache entries.

## Requirements

- Every key/item must be resolvable to an item key.

## Pitfalls

1. Mixed malformed entries can break batch semantics.
