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

- Returns `{ unsubscribe, meta, live }`; readonly `live.value` is true after registration completes.
- Plain subscription hooks receive none of `refresh`, `setResult` or `end`; these belong to followed `liveQuery` pages.
- Hooks always receive resolved `findOptions` after store `findDefaults` and `resolveFindOptions` transforms. No-argument `subscribe()` resolves with `many: true`, including defaults such as `pageSize`. `key` is set for keyed subscriptions, including numeric zero.
- Identity compares resolved reads, ignoring functions and client controls: `fetchPolicy`, `dedupe`, `experimentalGarbageCollection`, and `fetchOptions` (including `autoRefresh`). `resultMode` remains part of identity. Raw-different/resolved-equal options keep one transport; metadata-driven resolution changes reopen it.
- `unsubscribe` receives the resolved opening options and key, even after equivalent client-only option changes. Hook mutations cannot alter retained opening options. Disabling still closes transport.

## Requirements

- Subscription hooks/plugins must be implemented for backend transport.

## Pitfalls

1. Forgetting `unsubscribe` in long-lived contexts can leak backend subscriptions.
