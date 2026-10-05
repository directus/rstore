| name | description |
| --- | --- |
| `api-create-drizzle-op-log-store` | Reference for `createDrizzleOpLogStore(options)` |

# createDrizzleOpLogStore

Store collab documents (rich-text OT, experimental) in a Drizzle database, from `@rstore/nuxt-drizzle/collab`.

## Surface

`createDrizzleOpLogStore({ db, tables: { nodes, ops, docs }, mapping?, transaction?, appendGuard?, persistAppend?, retention?, now?, isTransientError?, onAppend?, onAppendError? })` returns an `OpLogStore` for `defineRstoreCollab` or `createCollabServer`.

## Syntax

```ts
import { createDrizzleOpLogStore } from '@rstore/nuxt-drizzle/collab'

defineRstoreCollab({
  store: createDrizzleOpLogStore({
    db: useDrizzle(),
    tables: { nodes: docNodes, ops: collabOps, docs: collabDocs },
    onAppend: (_docId, _entry, nodes) => nodes.forEach(record => publishRstoreDrizzleRealtimeUpdate({ collection: 'docNodes', type: 'updated', record })),
  }),
})
```

## Behavior

- Block rows live in an ordinary table (an rstore collection); `ops` holds the op log, `docs` the head and floor per document.
- `append` runs in one transaction; the unique `(docId, version)` catches a second writer, which rebases and retries. `transaction` may provide the application transaction executor, including tenant or RLS setup. SQLite lock errors are retried by default.
- `appendGuard(context)` and `persistAppend(context)` run in that transaction. The context has `{ tx, docId, entry, nodes, appendContext? }`; `appendContext` is private authenticated data returned by `authorize`, never stored or sent on the wire. Return a `CollabRejectReason` such as `forbidden` or `unavailable` from the guard to reject without an ack or broadcast.
- `mapping` maps canonical columns and row values to application tables. Node lookup and updates always use both `docId` and `id`, so repeated node ids are safe when the table has a matching composite unique key.
- `compact` advances the floor monotonically and removes old operation content while retaining `(docId, clientId, seq)` identity. A retried compacted submission remains a duplicate and cannot be applied again.
- `onAppend` runs after commit. Its failures go to `onAppendError` and do not turn a durable append into a failed retry.

## Requirements

- Default mapping expects properties: nodes `id`, `docId`, `parentId`, `orderKey`, `type`, `attrs` (JSON), `content` (JSON), `deleted` (boolean), `version`; ops `docId`, `version`, `clientId`, `seq`, `userId`, `ops` (JSON), `time`; docs `docId`, `head`, `floor`. Pass `mapping` for aliases or extra application columns.
- Enforce unique `(docId, id)` for nodes, unique `(docId, version)` for operations, unique `(docId, clientId, seq)` for operation submission identity, and unique `docId` for document heads.
- A driver with async transactions; WAL mode on SQLite.

## Pitfalls

1. better-sqlite3 and D1 are not supported.
2. Register `createMultiplayerPlugin({ ot: { collections: ['docNodes'] } })` on the client so realtime row frames are ordered by version (set `ws.lww: false` and install it yourself).
