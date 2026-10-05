| name | description |
| --- | --- |
| `api-sequence-transaction` | Reference for `sequenceTransaction(store, tx, options?)` |

# sequenceTransaction

Stateless sequencing of one transaction on an op log store. Experimental: the API can change in a minor release; the manual IME checks on Safari macOS, iOS Safari and Android Gboard are pending.

## Surface

`sequenceTransaction(store, tx, { userId?, role?, appendContext?, transform?, filterOp?, maxAttempts?, compactEvery? })` from `@rstore/multiplayer/server`; `rebaseTransaction(tx, opsSince)` is its pure core.

## Syntax

```ts
const result = await sequenceTransaction(store, tx, { userId })
if (result.status === 'ok') broadcast(result.entry)
```

## Behavior

- Deduplicates by `(clientId, seq)` (`duplicate`), rebases over the entries since `tx.baseVersion`, runs `filterOp`, applies the ops to the rows and appends with compare-and-set, retrying when another writer won.
- Returns `ok` (with `entry`, changed `nodes` and the rows `before`), `duplicate` or `rejected` (`reason`, `resync` when the base is below the floor). An `OpLogAppendRejected(reason)` from a durable append becomes `rejected`; it is not retried as a compare-and-set loss.
- `appendContext` is forwarded only to `store.append`; use it for a transaction-local authorization recheck or an atomic application outbox row.
- Calls `store.compact` every `compactEvery` versions (default 1000).

## Requirements

- A pluggable `OpLogStore`.

## Pitfalls

1. It keeps no state: the caller acks, broadcasts and rejects.
