| name | description |
| --- | --- |
| `api-live-query` | Reference for collection `liveQuery(...)` |

# liveQuery

## Surface

Reactive query with subscription lifecycle.

## Syntax

```ts
const q = await store.todos.liveQuery(b => b.many())
```

## Behavior

- Builds on query behavior and manages subscription updates.
- Refreshes when `realtimeReconnectEventHook` is triggered after realtime transport recovery.

## Requirements

- Requires plugin/runtime support for subscriptions to be meaningful.

## Pitfalls

1. Using `liveQuery` without subscription-capable plugins gives query behavior without realtime updates.
