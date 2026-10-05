# Collaborative documents <Badge text="Experimental" type="warning" />

Rich-text documents edited by several people at once, stored as **one rstore row per block** (paragraph, heading, list item…). A server orders every change (operational transformation, OT), so all clients converge, rows stay plain SQL-queryable records, and permissions apply per block.

::: warning Experimental
The `/ot`, `/server` sequencer and `/prosemirror` entries of `@rstore/multiplayer` are experimental: their API can change in a minor release. Automated IME tests pass in Chromium; the manual checks on Safari macOS (Japanese input), iOS Safari and Android Gboard are still pending, so test composition input on those platforms before relying on it there.
:::

Use it when documents must be first-class rows (queries, relations, per-block permissions, server-side automation) and a server is always reachable to confirm edits. For peer-to-peer or long offline sessions, a CRDT such as Yjs fits better:

| | rstore OT | Yjs |
| --- | --- | --- |
| Confirmation | The sequencing server confirms edits; offline edits stay local until reconnect | Merges without a server |
| Long offline | Rebased within the op log retention, then merged per block with conflict copies | Any divergence |
| Storage | Plain rows plus a compactable op log | Opaque binary document |
| Permissions | Per op and per block, redacted per peer | Per document |
| Scaling | One writer per document (sticky routing or a Durable Object) | Stateless relays |

## Data model

Each block is a `DocNodeRecord`:

```ts
interface DocNodeRecord {
  id: string // stable, client-generated
  docId: string
  parentId: string | null
  orderKey: string // fractional index among siblings
  type: string // ProseMirror node type
  attrs: Record<string, unknown>
  content: Delta | null // inline text and marks (Quill Delta), null for containers
  deleted: boolean // soft delete
  version: number // document version that last changed the row
}
```

Changes are `DocOp`s grouped in transactions: `text` (a Delta op on one block: insert, delete, format), `insertNode`, `deleteNode`, `restoreNode`, `moveNode`, `setAttrs`, `setType`, `splitNode` and `mergeNode`. Offsets are UTF-16 code units; an op that splits a surrogate pair is rejected. Marks are Delta attributes (`{ bold: true }`, `{ link: { href } }`); comment anchors use `comment:<id>` keys. Helpers such as `insertNodeOp`, `moveNodeOp`, `splitNodeOp` and `mergeNodeOp` compute order keys for you.

## Client

```ts
import { createCollabClient, createCollabUndoManager } from '@rstore/multiplayer/ot'

const client = createCollabClient({
  docId,
  clientId, // stable per tab or device
  send: frame => socket.send(JSON.stringify(frame)),
})
socket.onopen = () => client.connect()
socket.onclose = () => client.disconnect()
socket.onmessage = event => client.receive(JSON.parse(event.data))

client.on('change', ({ ops, origin }) => render(client.state))
client.submit([{ t: 'text', node: 'p1', ops: [{ retain: 5 }, { insert: '!' }] }])
const undo = createCollabUndoManager(client)
```

- Local edits apply at once; one transaction is in flight, later edits are composed into a buffer and sent after the ack.
- Remote transactions are transformed over pending ones. A refused transaction is split in halves and resubmitted, so only the refused ops are rolled back (`rejected` event).
- After a reconnect, the client resumes from its confirmed version and resubmits its in-flight transaction; the server never applies a `(clientId, seq)` twice.
- `client.pending` and `savePendingState`/`loadPendingState` persist unconfirmed edits in a `KeyValueStorage`; pass them back as `createCollabClient({ restore })`. When the server no longer has the history to rebase them, they are merged per block on the latest snapshot: overlapping text becomes a conflict copy inserted after the original (`attrs.conflictOf`, `conflict` event), so no text is lost. The pending ops tell the client's own characters from equal characters of other users, so the merge never re-labels or drops what someone else wrote (such a merge becomes a conflict copy too).
- `createCollabUndoManager(client)` undoes only this client's edits, transformed over everything that happened since.
- `createCompositionGuard(client)` holds remote ops for a block while the user composes (IME) and sends the composition as one transaction (the ProseMirror binding uses it).

| Event | Payload |
| --- | --- |
| `change` | `ops` applied to `client.state`, `origin` (`local`, `remote`, `rollback`, `reset`) |
| `confirmed` | The server state (`client.confirmed`) changed: `version`, changed node ids (`null` after a snapshot) |
| `rejected` | `reason` and the rolled back `ops` |
| `conflict` | A conflict copy was created |
| `status` | `synchronized`, `awaiting` or `awaiting-with-buffer` |

## Server

```ts
import { isCollabClientMessage } from '@rstore/multiplayer/protocol'
import { createCollabServer, createMemoryOpLogStore } from '@rstore/multiplayer/server'

const server = createCollabServer({
  store: createMemoryOpLogStore(),
  hooks: {
    authorize: async ({ peer, docId }) => (await canEdit(peer, docId)) ? { userId: peer.userId, role: 'editor' } : false,
    filterOp: ({ op, node, role }) => role === 'commenter' && op.t !== 'setAttrs' ? 'forbidden' : undefined,
    redact: ({ peer, node }) => node.attrs.private && node.attrs.owner !== peer.userId ? null : node,
  },
})

// In your WebSocket handler (`peer` needs `id` and `send(frame)`):
const frame = JSON.parse(text)
if (isCollabClientMessage(frame))
  await server.handleMessage(peer, frame)
server.handleClose(peer.id)

// Server-authored edits (agents, migrations), transformed and broadcast like any other:
await server.submitServer(docId, ops, { clientId: 'importer', seq: 1 })
```

- `sequenceTransaction(store, tx)` is the stateless core: it deduplicates by `(clientId, seq)`, rebases the transaction over the entries since its base version, runs `filterOp`, applies it to the rows and appends with compare-and-set. Run one writer per document across instances (sticky routing, a lease or a Durable Object); the compare-and-set turns a mistake into a retry, not a lost update.
- `authorize` runs once per peer and document; `filterOp` runs per op with the block before the op; a refusal rejects the whole transaction.
- `redact` returns `null` to hide a block, or a reduced copy (masked attributes). Ops that only touch hidden blocks reach the peer as version-only frames. Ops that mix hidden and visible blocks (a split into a hidden block, the merge of a hidden block into a visible one) or touch reduced blocks are sent as the changes of the peer's view of each block, so hidden ids and values never leak. Decide on stable properties (id, type, owner) and hide whole subtrees.

### Op log stores

`OpLogStore` is the persistence interface: `head`, `floor`, `range`, `findSubmission`, `loadNodes`, `append` (op log entry and node rows in one transaction, only if the version is the next one) and the optional `compact`. Stores shipped with rstore:

| Store | Use |
| --- | --- |
| `createMemoryOpLogStore()` | Tests and single-process servers; data is lost on restart |
| `createDrizzleOpLogStore()` from `@rstore/nuxt-drizzle/collab` | Any Drizzle database with async transactions, see [Nuxt + Drizzle](../../plugins/nuxt-drizzle.md#collab-op-log-store) |

Retention keeps an entry while it is among the last `minOps` (default 100 000) or younger than `maxAgeMs` (default 30 days). The sequencer calls `compact` every `compactEvery` versions (default 1 000); a client based below the floor gets a fresh snapshot and merges its pending edits as described above. Node rows are never deleted by compaction.

### Protocol

`collab:*` frames are versioned: the client lists the versions it speaks in `collab:hello`, the server answers with the highest common one in `collab:welcome`. Protocol 2 (current) opens a channel per document: later frames carry the channel number instead of the document and client ids, and authors are numbered per channel. A keystroke is about 165 bytes of JSON; with `permessage-deflate` enabled on the WebSocket server it is 10 to 20 bytes, on par with a Yjs update. Protocol 1 clients keep working.

## Cache

Mirror a document into a collection to query its blocks like any rows:

```ts
import { bindCollabCache, createMultiplayerPlugin } from '@rstore/multiplayer'

const store = await createStore({
  schema,
  plugins: [createMultiplayerPlugin({ ot: { collections: ['docNodes'] } })],
})
const stop = bindCollabCache(store, client, { collection: 'docNodes' })
```

- Confirmed blocks are committed rows; pending local edits live in the cache layer `multiplayer-ot:<docId>`, like an optimistic mutation, and disappear when confirmed or rolled back.
- For `ot` collections, a write whose `version` is not newer than the cached row is dropped (recorded in the `multiplayer:ot` item metadata). A realtime row frame published after the sequencer saved a change is therefore not applied twice, and an older row never overwrites a newer one. Field LWW does not apply to these collections.
- Do not mutate document rows with `create`/`update`/`delete`: edit through the collab client.

## ProseMirror

`@rstore/multiplayer/prosemirror` binds an editor to a client (`prosemirror-model`, `prosemirror-state`, `prosemirror-transform` and `prosemirror-view` are optional peer dependencies):

```ts
import { collabPlugin, collabRedo, collabUndo, docStateToNode, withNodeIds } from '@rstore/multiplayer/prosemirror'

const schema = new Schema({ nodes: withNodeIds(nodes), marks })
const undo = createCollabUndoManager(client)
const state = EditorState.create({
  doc: docStateToNode(schema, client.state),
  plugins: [collabPlugin({ client, undo }), keymap({ 'Mod-z': collabUndo(undo), 'Mod-Shift-z': collabRedo(undo) })],
})
```

The plugin turns editor transactions into ops (Enter and Backspace at block boundaries become splits and merges), applies remote ops as steps, assigns block ids and holds remote edits of the block being composed. With Tiptap, wrap `collabPlugin` in an extension.

## Nuxt

- Enable the sequencer on the multiplayer endpoint with the `collab` option of [`@rstore/nuxt-multiplayer-server`](../../plugins/nuxt-multiplayer-server.md#collab-documents) and configure it with `defineRstoreCollab()` in a Nitro plugin.
- Open documents with `useRstoreCollabDocument()` from [`@rstore/nuxt-multiplayer`](../../plugins/nuxt-multiplayer.md#collab-documents).
- Store documents in your database with [`createDrizzleOpLogStore`](../../plugins/nuxt-drizzle.md#collab-op-log-store).
