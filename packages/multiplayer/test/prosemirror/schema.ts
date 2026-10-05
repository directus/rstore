import { withNodeIds } from '@rstore/multiplayer/prosemirror'
import { Schema } from 'prosemirror-model'
import { schema as basic } from 'prosemirror-schema-basic'
import { addListNodes } from 'prosemirror-schema-list'

/** Basic + list nodes (StarterKit-like) with block ids, shared by the binding tests. */
export const testSchema = new Schema({
  nodes: withNodeIds(addListNodes(basic.spec.nodes, 'paragraph block*', 'block')),
  marks: basic.spec.marks,
})
