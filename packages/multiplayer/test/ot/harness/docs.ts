import type { Delta, DocNodeRecord, DocState } from '@rstore/multiplayer/ot'
import { createDocState, generateOrderKeys, orderedChildren } from '@rstore/multiplayer/ot'

/** Compact description of a node for test documents. */
export interface NodeSpec {
  id: string
  /** @default 'paragraph' (or 'bulletList' when `children` is set) */
  type?: string
  /** Text, Delta, or `null` for containers. @default '' for textblocks */
  content?: string | Delta | null
  attrs?: Record<string, unknown>
  children?: NodeSpec[]
  deleted?: boolean
}

/** Node records for a tree of specs, with increasing order keys per parent. */
export function buildNodes(specs: NodeSpec[], docId = 'doc', parentId: string | null = null): DocNodeRecord[] {
  const keys = generateOrderKeys(null, null, specs.length)
  return specs.flatMap((spec, index) => {
    const container = spec.children !== undefined
    const content = spec.content === undefined
      ? (container ? null : [])
      : typeof spec.content === 'string'
        ? (spec.content ? [{ insert: spec.content }] : [])
        : spec.content
    const record: DocNodeRecord = {
      id: spec.id,
      docId,
      parentId,
      orderKey: keys[index]!,
      type: spec.type ?? (container ? 'bulletList' : 'paragraph'),
      attrs: spec.attrs ?? {},
      content,
      deleted: spec.deleted ?? false,
      version: 0,
    }
    return [record, ...buildNodes(spec.children ?? [], docId, spec.id)]
  })
}

/** A document state from specs. */
export function buildDoc(specs: NodeSpec[], docId = 'doc'): DocState {
  return createDocState(docId, buildNodes(specs, docId), 0)
}

/** Renders content runs: marks as `{text|key=value}`, embeds as `<name>`. */
export function renderContent(content: Delta): string {
  return content.map((run) => {
    const body = typeof run.insert === 'string' ? run.insert : `<${Object.keys(run.insert)[0]}>`
    if (!run.attributes) {
      return body
    }
    const marks = Object.keys(run.attributes).sort().map(key => run.attributes![key] === true ? key : `${key}=${String(run.attributes![key])}`)
    return `{${body}|${marks.join(',')}}`
  }).join('')
}

/**
 * The visible document as indented lines (`type#id: text`), in sibling
 * order. Deleted nodes and their subtrees are omitted.
 */
export function outline(state: DocState): string[] {
  const lines: string[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const node of orderedChildren(state, parentId)) {
      const keys = Object.keys(node.attrs).sort()
      const attrs = keys.length ? ` ${JSON.stringify(Object.fromEntries(keys.map(key => [key, node.attrs[key]])))}` : ''
      const text = node.content ? `: ${renderContent(node.content)}` : ''
      lines.push(`${'  '.repeat(depth)}${node.type}#${node.id}${attrs}${text}`)
      walk(node.id, depth + 1)
    }
  }
  walk(null, 0)
  return lines
}

/** Visible text only (`id: text` lines), for scenarios that only care about text. */
export function visibleText(state: DocState): string[] {
  return outline(state).filter(line => line.includes(': ')).map(line => line.trim().replace(/^[^#]+#/, ''))
}

/** Every record (hidden ones included) sorted by id, for convergence checks. */
export function records(state: DocState, { withVersion = true } = {}): DocNodeRecord[] {
  return [...state.nodes.values()]
    .map(record => withVersion ? record : { ...record, version: 0 })
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
