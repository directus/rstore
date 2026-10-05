| name | description |
| --- | --- |
| `api-use-rstore-multiplayer-form` | Reference for `useRstoreMultiplayerForm(options)` |

# useRstoreMultiplayerForm

Synchronizes a form object with a multiplayer room.

## Surface

`useRstoreMultiplayerForm({ form, channel, trackedFields?, getBaseValue?, getTextFieldElement? })` returning `{ undoAndSync, redoAndSync }`.

## Syntax

```ts
const form = await store.Document.updateForm(props.id)

const { undoAndSync, redoAndSync } = useRstoreMultiplayerForm({
  form,
  channel,
  trackedFields: ['title', 'body'],
  getBaseValue: () => store.Document.peekFirst(props.id),
  getTextFieldElement: field => (field === 'title' ? titleInput.value : bodyTextarea.value),
})
```

## Behavior

- Broadcasts local changes to the room.
- Applies remote updates with form `$rebase` while keeping the caret of the focused input in place.
- Remote updates are untrusted: prototype-polluting keys are stripped; fields outside `trackedFields` are dropped when it is set.
- Use `undoAndSync` / `redoAndSync` to propagate undo/redo.

## Requirements

- Register `createMultiplayerPlugin()` to merge non-overlapping text edits instead of reporting conflicts.

## Pitfalls

1. Without `trackedFields`, any field a peer sends is applied.
2. Without a merger, text edits on the same field from two users become `$conflicts` entries.
