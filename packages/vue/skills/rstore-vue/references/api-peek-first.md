| name | description |
| --- | --- |
| `api-peek-first` | Reference for collection `peekFirst(...)` |

# peekFirst

## Surface

Cache-only read for one matching item.

## Syntax

```ts
const item = store.todos.peekFirst({ key: '1' })
```

## Behavior

- Reads from normalized cache only.
- Returns wrapped item or `null`.

## Requirements

- Item must already be in cache.

## Pitfalls

1. `peekFirst` does not trigger network fetches.
