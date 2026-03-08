| name | description |
| --- | --- |
| `api-write-item` | Reference for collection `writeItem(item)` |

# writeItem

## Surface

Writes one raw item into collection cache.

## Syntax

```ts
store.todos.writeItem({ id: '1', title: 'Cached' })
```

## Behavior

- Computes key and writes normalized item into cache.
- Returns wrapped cached item.

## Requirements

- Item must contain key fields used by collection.

## Pitfalls

1. Writing mismatched shapes can poison cache assumptions downstream.
