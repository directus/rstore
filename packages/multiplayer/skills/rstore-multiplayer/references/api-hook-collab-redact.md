| name | description |
| --- | --- |
| `api-hook-collab-redact` | Reference for the collab `redact` hook |

# redact hook (collab)

Per-peer visibility of blocks in collab documents. Experimental: the API can change in a minor release; the manual IME checks on Safari macOS, iOS Safari and Android Gboard are pending.

## Surface

`hooks.redact({ peer, role, node })` of `createCollabServer` (and `defineRstoreCollab`) returns the node, a reduced copy or `null`.

## Syntax

```ts
redact: ({ peer, node }) => node.attrs.private && node.attrs.owner !== peer.userId ? null : node
```

## Behavior

- `null` hides a block: snapshots omit it, ops touching only hidden blocks reach the peer as version-only frames.
- A reduced copy (masked attributes or content) is what the peer stores.
- Ops mixing hidden and visible blocks (split into a hidden block, merge of a hidden block into a visible one) or touching reduced blocks are sent as the changes of the peer's view, so hidden ids and values never leak.
- When the server moved a peer's concurrent edit into a hidden block, its ack carries corrected records.

## Requirements

- Decide on stable properties (id, type, owner) and hide whole subtrees.

## Pitfalls

1. A block whose visibility changes reaches the peer as an insertion or deletion; a peer that already knew it reloads.
