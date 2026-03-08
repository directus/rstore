| name | description |
| --- | --- |
| `api-peek-many` | Reference for collection `peekMany(...)` |

# peekMany

## Surface

Cache-only read for many items.

## Syntax

```ts
const items = store.todos.peekMany()
```

## Behavior

- Reads current cache state only.
- Returns wrapped item array.

## Requirements

- Cache must already contain relevant items.

## Pitfalls

1. No fetch path is triggered by `peekMany`.
