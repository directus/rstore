| name | description |
| --- | --- |
| `api-use-store` | Reference for `useStore()` |

# useStore

## Surface

Returns current injected or active store.

## Syntax

```ts
const store = useStore()
```

## Behavior

- Tries Vue injection first.
- Falls back to active store set by `setActiveStore`.

## Requirements

- Plugin installed or active store set.

## Pitfalls

1. Without injection and active store, `useStore()` throws.
