| name | description |
| --- | --- |
| `api-bind-collab-cache` | Reference for `bindCollabCache(store, client, options)` |

# bindCollabCache

Mirror a collab document into an rstore collection. Experimental: the API can change in a minor release; the manual IME checks on Safari macOS, iOS Safari and Android Gboard are pending.

## Surface

`bindCollabCache(store, client, { collection })` from `@rstore/multiplayer`; returns a function that stops mirroring.

## Syntax

```ts
const stop = bindCollabCache(store, client, { collection: 'docNodes' })
const blocks = store.docNodes.peekMany()
```

## Behavior

- Confirmed blocks are committed rows; pending local edits are in the cache layer `multiplayer-ot:<docId>`, removed when confirmed or rolled back.
- Queries, relations and forms read blocks as plain rows.

## Requirements

- The store uses `createMultiplayerPlugin({ ot: { collections: [collection] } })`.

## Pitfalls

1. Call the returned function when the document closes, or the layer stays.
