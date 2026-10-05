| name | description |
| --- | --- |
| `api-create-collab-server` | Reference for `createCollabServer(options)` |

# createCollabServer

Sequencer of collab documents for any transport. Experimental: the API can change in a minor release; the manual IME checks on Safari macOS, iOS Safari and Android Gboard are pending.

## Surface

`createCollabServer({ store, hooks?, transform?, compactEvery?, maxIngressReplay? })` from `@rstore/multiplayer/server`, with `handleMessage(peer, frame)`, `handleClose(peerId)`, `submitServer(docId, ops, options?)`, and `ingestCommitted(payload)`.

## Syntax

```ts
const server = createCollabServer({ store: createMemoryOpLogStore(), hooks: { authorize, filterOp, redact } })
const frame = JSON.parse(text)
if (isCollabClientMessage(frame))
  await server.handleMessage(peer, frame)
await server.submitServer(docId, ops, { clientId: 'importer', seq: 1 })
await server.ingestCommitted({ docId, entry, nodes })
```

## Behavior

- Sequences transactions one at a time per document and instance, acks the sender and broadcasts to the other peers.
- `authorize` runs once per peer and document; `filterOp` per op (a refusal rejects the whole transaction); `redact` per block and peer. Its `CollabAccess.appendContext` reaches every `store.append` of that submission without entering a wire frame or stored op row.
- Speaks protocol 1 and 2 (channels: frames without repeated document and client ids).
- `submitServer` sequences server-authored ops like a client transaction; a stable `clientId` and `seq` make retries idempotent. Its `appendContext` option supplies the same private transaction-local data.
- `ingestCommitted` receives a post-commit event from another process. It verifies the event against `store.findSubmission` and retained log identity before delivering it. Repeated events do nothing; out-of-order events replay the durable missing range in version order. If history is compacted, redaction is active, or the gap exceeds `maxIngressReplay` (default `1000`), existing snapshot delivery catches the peer up.

## Requirements

- `peer` needs `id` and `send(frame)`; validate raw frames with `isCollabClientMessage`.
- One writer per document across instances (sticky routing, lease or Durable Object).
- Publish an `ingestCommitted` payload only after the durable append commits. Ignore same-process events because its local sequencer already broadcast the entry.

## Pitfalls

1. The memory store loses documents on restart.
2. `transform` options must match the clients.
