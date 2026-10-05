| name | description |
| --- | --- |
| `api-entry-ot` | Reference for the `@rstore/multiplayer/ot` entry (collab documents) |

# @rstore/multiplayer/ot

Server-ordered rich-text OT for documents stored as one row per block. Experimental: the API can change in a minor release; the manual IME checks on Safari macOS, iOS Safari and Android Gboard are pending.

## Surface

Ops and Deltas (`DocOp`, `Delta`, `DocNodeRecord`), authoring helpers (`insertNodeOp`, `moveNodeOp`, `splitNodeOp`, `mergeNodeOp`), `createCollabClient`, `createCollabUndoManager`, `createCompositionGuard`, `savePendingState`/`loadPendingState`.

## Syntax

```ts
import { createCollabClient, splitNodeOp } from '@rstore/multiplayer/ot'

client.submit([splitNodeOp(client.state, 'p1', 5, crypto.randomUUID())])
```

## Behavior

- A block is a `DocNodeRecord`: `id`, `docId`, `parentId`, `orderKey`, `type`, `attrs`, `content` (Quill Delta or `null` for containers), `deleted` (soft), `version`.
- Ops: `text`, `insertNode`, `deleteNode`, `restoreNode`, `moveNode`, `setAttrs`, `setType`, `splitNode`, `mergeNode`.
- Offsets are UTF-16 code units; an op splitting a surrogate pair is rejected.
- Marks are Delta attributes (`{ bold: true }`, `{ link: { href } }`); comment anchors use `comment:<id>` keys.
- Authoring helpers compute fractional order keys for you.

## Requirements

- A sequencing server (`createCollabServer` or the Nuxt `collab` option) must confirm edits.

## Pitfalls

1. Do not compute order keys or split/merge offsets by hand: use the helpers.
2. It is not a CRDT: offline edits are only rebased while the op log still has their history, then merged per block with conflict copies.
