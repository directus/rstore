import type { Delta, DeltaEmbed, TextOp, TextOpComponent } from '../types.js'
import type { AttributeMap } from './attributes.js'
import { attributesEqual, nonEmpty } from './attributes.js'
import { componentLength } from './iterator.js'

/**
 * Accumulates components in canonical form: empty components dropped,
 * adjacent components of the same kind and marks merged, and an insert
 * always placed before an adjacent delete (both orders mean the same edit).
 */
export class TextOpBuilder {
  readonly ops: TextOpComponent[] = []

  /** Appends a retain, optionally with format attributes. */
  retain(length: number, attributes?: AttributeMap): this {
    return length > 0 ? this.push(attributes && nonEmpty(attributes) ? { retain: length, attributes } : { retain: length }) : this
  }

  /** Appends an insert. */
  insert(insert: string | DeltaEmbed, attributes?: AttributeMap): this {
    if (insert === '') {
      return this
    }
    return this.push(attributes && nonEmpty(attributes) ? { insert, attributes } : { insert })
  }

  /** Appends a delete. */
  delete(length: number): this {
    return length > 0 ? this.push({ delete: length }) : this
  }

  /** Appends any component, merging it with the previous one when possible. */
  push(component: TextOpComponent): this {
    if (componentLength(component) <= 0) {
      return this
    }
    if ('attributes' in component && !nonEmpty(component.attributes)) {
      const { attributes: _attributes, ...rest } = component
      component = rest as TextOpComponent
    }
    let index = this.ops.length
    let last = this.ops[index - 1]
    if (last && 'delete' in component && 'delete' in last) {
      this.ops[index - 1] = { delete: last.delete + component.delete }
      return this
    }
    // Canonical order: an insert next to a delete goes first.
    if (last && 'delete' in last && 'insert' in component) {
      index--
      last = this.ops[index - 1]
      if (!last) {
        this.ops.unshift(component)
        return this
      }
    }
    if (last && attributesEqual((last as { attributes?: AttributeMap }).attributes, (component as { attributes?: AttributeMap }).attributes)) {
      if ('insert' in last && 'insert' in component && typeof last.insert === 'string' && typeof component.insert === 'string') {
        this.ops[index - 1] = withAttributes({ insert: last.insert + component.insert }, last.attributes)
        return this
      }
      if ('retain' in last && 'retain' in component) {
        this.ops[index - 1] = withAttributes({ retain: last.retain + component.retain }, last.attributes)
        return this
      }
    }
    this.ops.splice(index, 0, component)
    return this
  }

  /** The op without its trailing plain retain. */
  chop(): TextOp {
    const last = this.ops.at(-1)
    if (last && 'retain' in last && !last.attributes) {
      this.ops.pop()
    }
    return this.ops
  }
}

/** Adds non-empty attributes to a component. */
function withAttributes<T extends TextOpComponent>(component: T, attributes: AttributeMap | undefined): T {
  return attributes ? { ...component, attributes } : component
}

/** Canonical form of an op: merged components, no trailing plain retain. */
export function normalizeTextOp(op: TextOp): TextOp {
  const builder = new TextOpBuilder()
  for (const component of op) {
    builder.push(component)
  }
  return builder.chop()
}

/** Canonical form of content: adjacent text runs with equal marks merged. */
export function normalizeDelta(content: Delta): Delta {
  return normalizeTextOp(content) as Delta
}

/** Length of content in UTF-16 code units (an embed counts as 1). */
export function deltaLength(content: Delta): number {
  let length = 0
  for (const run of content) {
    length += typeof run.insert === 'string' ? run.insert.length : 1
  }
  return length
}

/** Plain text of content; each embed becomes U+FFFC (object replacement character). */
export function deltaToPlainText(content: Delta): string {
  let text = ''
  for (const run of content) {
    text += typeof run.insert === 'string' ? run.insert : '\uFFFC'
  }
  return text
}
