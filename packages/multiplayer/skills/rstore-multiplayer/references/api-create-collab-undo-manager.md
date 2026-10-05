| name | description |
| --- | --- |
| `api-create-collab-undo-manager` | Reference for `createCollabUndoManager(client, options?)` |

# createCollabUndoManager

Per-user undo and redo of a collab client. Experimental: the API can change in a minor release; the manual IME checks on Safari macOS, iOS Safari and Android Gboard are pending.

## Surface

`createCollabUndoManager(client, { groupMs?, maxDepth?, transform?, now? })` from `@rstore/multiplayer/ot`, with `undo()`, `redo()`, `canUndo`, `canRedo`, `stopCapturing()`.

## Syntax

```ts
const undo = createCollabUndoManager(client)
undo.undo()
```

## Behavior

- Undoes only this client's edits, transformed over every later edit.
- Consecutive edits of one block within `groupMs` (500 ms) form one step; `stopCapturing()` ends a step.
- Never removes characters another user wrote.

## Requirements

- One manager per client.

## Pitfalls

1. Undoing an insert someone else already deleted is a no-op.
