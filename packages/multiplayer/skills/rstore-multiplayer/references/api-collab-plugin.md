| name | description |
| --- | --- |
| `api-collab-plugin` | Reference for `collabPlugin(options)` (ProseMirror) |

# collabPlugin

ProseMirror binding of a collab client, from `@rstore/multiplayer/prosemirror`. Experimental: the API can change in a minor release; the manual IME checks on Safari macOS, iOS Safari and Android Gboard are pending.

## Surface

`collabPlugin({ client, undo?, composition?, createId? })`, with `collabUndo(undo)`/`collabRedo(undo)` commands, `withNodeIds(nodes)` and `docStateToNode(schema, state)`.

## Syntax

```ts
const schema = new Schema({ nodes: withNodeIds(nodes), marks })
const undo = createCollabUndoManager(client)
EditorState.create({ doc: docStateToNode(schema, client.state), plugins: [collabPlugin({ client, undo }), keymap({ 'Mod-z': collabUndo(undo) })] })
```

## Behavior

- Turns editor transactions into ops (Enter/Backspace at block boundaries become splits/merges) and remote ops into steps.
- Assigns block ids; holds remote edits of the block being composed (IME) and sends a composition as one transaction.

## Requirements

- `prosemirror-model`, `prosemirror-state`, `prosemirror-transform` and `prosemirror-view` (optional peer dependencies).
- Block nodes need the `id` attribute (`withNodeIds`).

## Pitfalls

1. Use the collab undo commands, not `prosemirror-history`.
2. With Tiptap, wrap the plugin in an extension.
