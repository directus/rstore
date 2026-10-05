| name | description |
| --- | --- |
| `api-create-memory-op-log-store` | Reference for `createMemoryOpLogStore(options?)` |

# createMemoryOpLogStore

In-memory `OpLogStore`. Experimental: the API can change in a minor release; the manual IME checks on Safari macOS, iOS Safari and Android Gboard are pending.

## Surface

`createMemoryOpLogStore({ retention?, now? })` from `@rstore/multiplayer/server`, with `seed(docId, nodes, version?)`, `state(docId)` and `compact(docId)`.

## Syntax

```ts
const store = createMemoryOpLogStore({ retention: { minOps: 10_000 } })
store.seed('doc', nodes, 0)
```

## Behavior

- Keeps the op log and rows in memory with the default retention.

## Requirements

- Tests and single-process servers.

## Pitfalls

1. Documents are lost on restart.
