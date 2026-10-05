<script lang="ts" setup>
import type { CollabClient } from '@rstore/multiplayer/ot'
import { createCollabUndoManager } from '@rstore/multiplayer/ot'
import { collabPlugin, collabRedo, collabUndo, docStateToNode, withNodeIds } from '@rstore/multiplayer/prosemirror'
import { baseKeymap } from 'prosemirror-commands'
import { keymap } from 'prosemirror-keymap'
import { Schema } from 'prosemirror-model'
import { schema as basic } from 'prosemirror-schema-basic'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'

const props = defineProps<{
  client: CollabClient
}>()

const schema = new Schema({ nodes: withNodeIds(basic.spec.nodes), marks: basic.spec.marks })
const root = useTemplateRef('root')
let view: EditorView | undefined

onMounted(() => {
  const undo = createCollabUndoManager(props.client)
  view = new EditorView(root.value!, {
    state: EditorState.create({
      doc: docStateToNode(schema, props.client.state),
      plugins: [
        collabPlugin({ client: props.client, undo }),
        keymap({ 'Mod-z': collabUndo(undo), 'Mod-Shift-z': collabRedo(undo) }),
        keymap(baseKeymap),
      ],
    }),
  })
})

onBeforeUnmount(() => view?.destroy())
</script>

<template>
  <div
    ref="root"
    data-testid="collab-editor"
    class="border border-default rounded-lg p-3 min-h-24 [&_.ProseMirror]:outline-none [&_.ProseMirror]:whitespace-pre-wrap"
  />
</template>
