import { withNodeIds } from '@rstore/multiplayer/prosemirror'
import { Schema } from 'prosemirror-model'
import { schema as basic } from 'prosemirror-schema-basic'
import { addListNodes } from 'prosemirror-schema-list'

/** StarterKit-like schema with block ids. */
export const schema = new Schema({ nodes: withNodeIds(addListNodes(basic.spec.nodes, 'paragraph block*', 'block')), marks: basic.spec.marks })

/** Seeded PRNG so a failing run replays. */
export function prng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), state | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
