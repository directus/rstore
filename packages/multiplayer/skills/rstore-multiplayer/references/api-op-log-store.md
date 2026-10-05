| name | description |
| --- | --- |
| `api-op-log-store` | Reference for the `OpLogStore` interface |

# OpLogStore

Persistence interface of the collab sequencer. Experimental: the API can change in a minor release; the manual IME checks on Safari macOS, iOS Safari and Android Gboard are pending.

## Surface

`head`, `floor`, `range(docId, after, upTo?)`, `findSubmission(docId, clientId, seq)`, `loadNodes`, `append(docId, entry, nodes, appendContext?)` and optional `compact(docId)`, all async.

## Syntax

```ts
const store: OpLogStore = {
  head, floor, range, findSubmission, loadNodes,
  append: async (docId, entry, nodes) => /* insert entry + upsert rows if entry.version === head + 1 */ true,
  compact: async docId => { /* drop entries up to compactionFloor(...) */ },
}
```

## Behavior

- `append` writes the op log entry and the block rows atomically, only if `entry.version` is the next version; it returns `false` when another writer appended first. `appendContext` carries authenticated application data to the store and is never persisted by the sequencer.
- `compactionFloor({ head, floor, firstRecentVersion }, retention)` gives the floor a compaction may raise to: keep the last `minOps` (100 000) or entries newer than `maxAgeMs` (30 days).
- Compaction must never lower the floor. Stores may erase old operation content, but must retain submission identity so an offline retry cannot become a second edit.
- Transactions based below `floor` are rejected with `history-truncated`.

## Requirements

- Shipped stores: `createMemoryOpLogStore` and `createDrizzleOpLogStore` (`@rstore/nuxt-drizzle/collab`).

## Pitfalls

1. Never delete block rows on compaction: undo and late transactions may still address soft-deleted blocks.
2. A durable permission refusal throws `OpLogAppendRejected(reason)`; `sequenceTransaction` turns it into a `rejected` result instead of treating it as compare-and-set loss.
