| name | description |
| --- | --- |
| `api-use-rstore-collab-document` | Reference for `useRstoreCollabDocument(docId, options?)` |

# useRstoreCollabDocument

Open a collab document in Nuxt (`@rstore/nuxt-multiplayer`). Experimental: the API can change in a minor release; the manual IME checks on Safari macOS, iOS Safari and Android Gboard are pending.

## Surface

`useRstoreCollabDocument(docId, { collection?, endpoint?, clientId?, transform? })` returns `client`, `state`, `loaded`, `status`, `connection`, `submit(ops)`.

## Syntax

```ts
const doc = useRstoreCollabDocument(docId, { collection: 'docNodes' })
```

## Behavior

- Connects to `runtimeConfig.public.rstoreMultiplayerEndpoint` (set by `@rstore/nuxt-multiplayer-server`), reconnects on its own and resumes from the confirmed version.
- `state` triggers on every change; with `collection`, the document is mirrored into the store (`bindCollabCache`).
- Closes when the component or effect scope is disposed.

## Requirements

- The server module with `collab: true`.
- For `collection`, `createMultiplayerPlugin({ ot: { collections: [collection] } })`.

## Pitfalls

1. Unconfirmed edits are not persisted across reloads: use `createCollabClient` with `savePendingState` for that.
