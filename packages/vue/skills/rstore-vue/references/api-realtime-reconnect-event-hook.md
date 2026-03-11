| name | description |
| --- | --- |
| `api-realtime-reconnect-event-hook` | Reference for `realtimeReconnectEventHook` |

# realtimeReconnectEventHook

## Surface

Shared event hook exported by `@rstore/vue` for realtime transport reconnects.

## Syntax

```ts
import { realtimeReconnectEventHook } from '@rstore/vue'

const query = await store.todos.liveQuery(b => b.many())

const { off } = realtimeReconnectEventHook.on(() => {
  query.refresh()
})

realtimeReconnectEventHook.trigger()
```

## Behavior

- Realtime plugins trigger it after the transport recovers from a disconnect.
- `liveQuery` listens to it and calls `refresh()`.
- Works best after subscriptions have been re-established.

## Requirements

- Trigger it only when reconnect recovery is complete enough to refetch safely.

## Pitfalls

1. Triggering it on the first successful connection causes unnecessary extra refreshes.
2. Triggering it before subscriptions or auth state are restored can refresh queries too early.
