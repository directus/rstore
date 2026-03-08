| name | description |
| --- | --- |
| `api-subscribe` | Reference for collection `subscribe(...)` |

# subscribe

## Surface

Starts subscription lifecycle without query object.

## Syntax

```ts
const sub = store.todos.subscribe(c => c({ where: eq('status', 'open') }))
await sub.unsubscribe()
```

## Behavior

- Returns `{ unsubscribe, meta }`.
- Handles option-driven subscribe/unsubscribe lifecycle.

## Requirements

- Subscription hooks/plugins must be implemented for backend transport.

## Pitfalls

1. Forgetting `unsubscribe` in long-lived contexts can leak backend subscriptions.
