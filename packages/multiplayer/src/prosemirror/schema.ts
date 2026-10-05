import type { NodeSpec } from 'prosemirror-model'
import { NODE_ID_ATTR } from './convert.js'

/** Node specs as an `OrderedMap` (schema spec) or a plain object. */
type NodeSpecs = { forEach: (f: (name: string, spec: NodeSpec) => void) => void } | Record<string, NodeSpec>

/**
 * Adds the `id` attribute the binding needs to every block node spec (all
 * specs except the top node, text and inline nodes). Accepts the
 * `OrderedMap` of a schema spec or a plain object.
 *
 * @example new Schema({ nodes: withNodeIds(addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block')), marks })
 */
export function withNodeIds(nodes: NodeSpecs, topNode = 'doc'): Record<string, NodeSpec> {
  const result: Record<string, NodeSpec> = {}
  const add = (name: string, spec: NodeSpec) => {
    result[name] = name === topNode || name === 'text' || spec.inline
      ? spec
      : { ...spec, attrs: { ...spec.attrs, [NODE_ID_ATTR]: { default: null } } }
  }
  if (typeof nodes.forEach === 'function') {
    (nodes as Extract<NodeSpecs, { forEach: unknown }>).forEach(add)
  }
  else {
    for (const [name, spec] of Object.entries(nodes as Record<string, NodeSpec>)) {
      add(name, spec)
    }
  }
  return result
}
