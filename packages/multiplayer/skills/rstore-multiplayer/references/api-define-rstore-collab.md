| name | description |
| --- | --- |
| `api-define-rstore-collab` | Reference for `defineRstoreCollab(options)` |

# defineRstoreCollab

Configure the Nitro collab sequencer. Experimental: the API can change in a minor release; the manual IME checks on Safari macOS, iOS Safari and Android Gboard are pending.

## Surface

`defineRstoreCollab({ store?, hooks?, transform?, compactEvery? })` (server auto-import with `collab: true`); `useRstoreCollabServer()` returns the sequencer.

## Syntax

```ts
export default defineNitroPlugin(() => {
  defineRstoreCollab({
    store: createDrizzleOpLogStore({ db, tables }),
    hooks: { authorize: async ({ peer, docId }) => ({ userId: await userFrom(peer.ws.request) }) },
  })
})
```

## Behavior

- Hooks receive `peer.ws`, the crossws peer with its upgrade request.
- Calling it again replaces the sequencer.
- `useRstoreCollabServer().submitServer(docId, ops)` sequences server-authored edits.

## Requirements

- Call it in a Nitro plugin, before clients connect.

## Pitfalls

1. Without `store`, an in-memory store: lost on restart, single process only.
2. Route each document to one server process.
