import type { Delta, DocOp, DocState, TextOp } from '@rstore/multiplayer/ot'
import type { NodeSpec } from './docs'
import type { Random } from './random'
import type { TextStep } from './textArbitraries'
import { deltaLength, insertNodeOp, isNodeVisible, mergeNodeOp, moveNodeOp, orderedChildren, splitNodeOp } from '@rstore/multiplayer/ot'
import { buildDoc } from './docs'
import { buildTextOp } from './textArbitraries'

/** Every structure and text op type (the plan's eight plus `setType`). */
export const DOC_OP_TYPES = ['text', 'insertNode', 'deleteNode', 'restoreNode', 'moveNode', 'setAttrs', 'setType', 'splitNode', 'mergeNode'] as const

/** One op type name. */
export type DocOpType = typeof DOC_OP_TYPES[number]

const CHARS = ['a', 'b', 'c', ' ', '😀']
const INSERT_MARKS = [undefined, undefined, { bold: true }, { italic: true }, { link: 'https://a' }]
const FORMATS: Array<Record<string, unknown>> = [{ bold: true }, { bold: null }, { italic: true }, { link: 'https://b' }, { link: null }]

/** Random short text of whole code points. */
export function randomText(random: Random, max = 3): string {
  let text = ''
  for (let i = random.int(1, max); i > 0; i--) {
    text += random.pick(CHARS)
  }
  return text
}

/** Random textblock content. */
export function randomDelta(random: Random): Delta {
  const op = randomTextOp(random, [])
  return op as Delta
}

/** Random valid op on `content` (inserts, deletes, formats, embeds). */
export function randomTextOp(random: Random, content: Delta, maxSteps = 4, marks?: Record<string, unknown>): TextOp {
  const steps: TextStep[] = []
  for (let i = random.int(1, maxSteps); i > 0; i--) {
    steps.push({
      kind: random.pick(['retain', 'retain', 'format', 'delete', 'insert', 'insert'] as const),
      size: random.int(1, 4),
      insert: random.bool(0.1) ? { hardBreak: true } : randomText(random),
      insertAttributes: marks ? { ...random.pick(INSERT_MARKS), ...marks } : random.pick(INSERT_MARKS),
      formatAttributes: random.pick(FORMATS),
    })
  }
  return buildTextOp(content, steps)
}

/** A random document: a few paragraphs, a list container, sometimes hidden or merged-away nodes. */
export function randomDoc(random: Random): DocState {
  const specs: NodeSpec[] = []
  for (let i = random.int(2, 4); i > 0; i--) {
    specs.push({ id: `p${i}`, content: randomDelta(random), deleted: random.bool(0.1) })
  }
  if (random.bool(0.7)) {
    specs.splice(random.int(0, specs.length), 0, {
      id: 'list',
      children: [
        { id: 'li1', type: 'listItem', children: [{ id: 'l1', content: randomDelta(random) }] },
        { id: 'li2', type: 'listItem', children: [{ id: 'l2', content: randomDelta(random) }] },
      ],
    })
  }
  if (random.bool(0.3)) {
    // A node merged away earlier: undo can revive it through a split.
    specs.push({ id: 'gone', content: [], deleted: true })
  }
  return buildDoc(specs)
}

/** Options of `randomDocOp`. */
export interface RandomDocOpOptions {
  /** Marks added to inserted text (author attribution in the fuzz). */
  marks?: Record<string, unknown>
  /** Only address visible nodes, like an editor does. @default false */
  visibleOnly?: boolean
}

/**
 * A random op of the given type, valid on `state`. New node ids get
 * `prefix`, so two concurrent generated ops never create the same id.
 * Returns `null` when the document has no candidate for that type.
 */
export function randomDocOp(random: Random, state: DocState, type: DocOpType, prefix: string, options: RandomDocOpOptions = {}): DocOp | null {
  const { marks } = options
  const nodes = [...state.nodes.values()].filter(node => !options.visibleOnly || isNodeVisible(state, node.id))
  const blocks = nodes.filter(node => node.content !== null)
  const containers = nodes.filter(node => node.content === null)
  if (!blocks.length && type !== 'insertNode') {
    // Everything visible was deleted: an editor can still type a new paragraph.
    return randomDocOp(random, state, 'insertNode', prefix, options)
  }
  switch (type) {
    case 'text': {
      const node = random.pick(blocks)
      return { t: 'text', node: node.id, ops: randomTextOp(random, node.content!, 4, marks) }
    }
    case 'insertNode': {
      const parent = random.bool(0.7) ? null : random.pick(containers.length ? containers : [null as never]) ?? null
      const siblings = orderedChildren(state, parent?.id ?? null, { includeDeleted: true })
      const after = random.int(0, siblings.length)
      const content = marks ? [{ insert: randomText(random), attributes: marks }] : randomDelta(random)
      return insertNodeOp(state, { id: `${prefix}n`, type: 'paragraph', attrs: {}, content }, { parentId: parent?.id ?? null, after: siblings[after - 1]?.id ?? null })
    }
    case 'deleteNode':
    case 'restoreNode':
      return { t: type, node: random.pick(nodes).id }
    case 'moveNode': {
      const node = random.pick(nodes)
      const parent = random.bool(0.6) ? null : random.pick(containers.length ? containers : [null as never]) ?? null
      const siblings = orderedChildren(state, parent?.id ?? null, { includeDeleted: true }).filter(sibling => sibling.id !== node.id)
      const after = random.int(0, siblings.length)
      return moveNodeOp(state, node.id, { parentId: parent?.id ?? null, after: siblings[after - 1]?.id ?? null })
    }
    case 'setAttrs':
      return { t: 'setAttrs', node: random.pick(nodes).id, attrs: random.pick([{ level: 1 }, { level: 2 }, { level: null }, { align: 'left', level: 3 }]) }
    case 'setType':
      return { t: 'setType', node: random.pick(blocks).id, type: random.pick(['paragraph', 'heading']) }
    case 'splitNode': {
      const node = random.pick(blocks.filter(block => !block.deleted).length ? blocks.filter(block => !block.deleted) : blocks)
      const at = randomBoundary(random, node.content!)
      const revive = state.nodes.get('gone')
      const newNode = revive && revive.deleted && random.bool(0.2) && node.id !== 'gone' ? 'gone' : `${prefix}s`
      return splitNodeOp(state, node.id, at, newNode, { newAttrs: random.bool(0.2) ? { level: 1 } : undefined })
    }
    case 'mergeNode': {
      const node = random.pick(blocks)
      const targets = blocks.filter(block => block.id !== node.id)
      if (!targets.length) {
        return null
      }
      return mergeNodeOp(state, node.id, random.pick(targets).id)
    }
  }
}

/** A random offset of `content` that does not split a surrogate pair. */
export function randomBoundary(random: Random, content: Delta): number {
  const boundaries = [0]
  let offset = 0
  for (const run of content) {
    if (typeof run.insert !== 'string') {
      boundaries.push(++offset)
      continue
    }
    for (const char of run.insert) {
      offset += char.length
      boundaries.push(offset)
    }
  }
  return random.pick(boundaries.length ? boundaries : [deltaLength(content)])
}
