| name | description |
| --- | --- |
| `api-clear-item` | Reference for collection `clearItem(key)` |

# clearItem

## Surface

Removes one cached item by key.

## Syntax

```ts
store.todos.clearItem('1')
```

## Behavior

- Deletes item entry from cache for target collection.

## Requirements

- Key must match collection key format.

## Pitfalls

1. Clearing item still referenced by UI queries may lead to temporary null states until refetch.
