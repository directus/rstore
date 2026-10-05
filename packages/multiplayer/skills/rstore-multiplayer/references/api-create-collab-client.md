| name | description |
| --- | --- |
| `api-create-collab-client` | Reference for `createCollabClient(options)` |

# createCollabClient

Client of one collab document over any transport. Experimental: the API can change in a minor release; the manual IME checks on Safari macOS, iOS Safari and Android Gboard are pending.

## Surface

`createCollabClient({ docId, clientId, send, transform?, initial?, restore?, channel? })` from `@rstore/multiplayer/ot`, with `state`, `confirmed`, `loaded`, `status`, `pending`, `submit(ops)`, `receive(frame)`, `connect()`, `disconnect()`, `on(event, listener)`.

## Syntax

```ts
const client = createCollabClient({ docId, clientId, send: frame => socket.send(JSON.stringify(frame)) })
socket.onopen = () => client.connect()
socket.onclose = () => client.disconnect()
socket.onmessage = event => client.receive(JSON.parse(event.data))
const inverse = client.submit([{ t: 'text', node: 'p1', ops: [{ retain: 5 }, { insert: '!' }] }])
```

## Behavior

- Local edits apply at once; one transaction is in flight, later edits are composed into a buffer.
- Remote transactions are transformed over pending ones; a refused transaction is bisected so only refused ops roll back (`rejected` event).
- After a reconnect it resumes from its confirmed version and resubmits the in-flight transaction; the server never applies a `(clientId, seq)` twice.
- Events: `change` (`origin`: `local`, `remote`, `rollback`, `reset`), `confirmed` (server state changed), `rejected`, `conflict`, `status`.
- `pending` plus `savePendingState`/`loadPendingState` persist unconfirmed edits; pass them back as `restore`.

## Requirements

- `clientId` must be stable per tab or device (persist it with the pending state).
- `transform` options must match the server.

## Pitfalls

1. `submit` throws before the first snapshot (`loaded` is false).
2. Past the op log retention, offline edits are merged per block on a snapshot: overlapping text becomes a conflict copy (`attrs.conflictOf`); the merge never re-labels or drops characters other users wrote.
