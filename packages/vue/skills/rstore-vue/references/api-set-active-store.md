| name | description |
| --- | --- |
| `api-set-active-store` | Reference for `setActiveStore(store | null)` |

# setActiveStore

## Surface

Sets store used by `useStore()` outside injection contexts.

## Syntax

```ts
setActiveStore(store)
// ...
setActiveStore(null)
```

## Behavior

- Primarily for tests or non-component code paths.

## Requirements

- Clear/reset between tests to avoid leaks.

## Pitfalls

1. Leaving stale active store can contaminate later tests/flows.
