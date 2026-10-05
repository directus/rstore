import { fieldValuesEqual } from '@rstore/shared'

/** Attribute map of a component; `null` values remove a mark (format ops only). */
export type AttributeMap = Record<string, unknown>

/** Returns `undefined` for an empty map, so components never carry `{}`. */
export function nonEmpty(attributes: AttributeMap | undefined): AttributeMap | undefined {
  return attributes && Object.keys(attributes).length > 0 ? attributes : undefined
}

/** Structural equality of two attribute maps (`undefined` equals `{}`). */
export function attributesEqual(a: AttributeMap | undefined, b: AttributeMap | undefined): boolean {
  return fieldValuesEqual(nonEmpty(a) ?? {}, nonEmpty(b) ?? {})
}

/**
 * Attributes of `a` then `b`: keys of `b` override. With `keepNull` (the
 * result is a format component), `null` removals are kept; otherwise they are
 * dropped (the result is content).
 */
export function composeAttributes(a: AttributeMap | undefined, b: AttributeMap | undefined, keepNull: boolean): AttributeMap | undefined {
  const result: AttributeMap = {}
  if (b) {
    for (const key in b) {
      if (keepNull || b[key] !== null) {
        result[key] = b[key]
      }
    }
  }
  if (a) {
    for (const key in a) {
      if (a[key] !== undefined && b?.[key] === undefined) {
        result[key] = a[key]
      }
    }
  }
  return nonEmpty(result)
}

/**
 * Format attributes of `b` once `a` is applied on the same characters. The
 * later sequenced op wins per key: when `a` is later, `b` loses the keys `a` set.
 */
export function transformAttributes(a: AttributeMap | undefined, b: AttributeMap | undefined, bIsLater: boolean): AttributeMap | undefined {
  if (!b) {
    return undefined
  }
  if (!a || bIsLater) {
    return b
  }
  const result: AttributeMap = {}
  for (const key in b) {
    if (a[key] === undefined) {
      result[key] = b[key]
    }
  }
  return nonEmpty(result)
}

/** Format attributes that undo `attributes` on characters whose marks were `base`. */
export function invertAttributes(attributes: AttributeMap | undefined, base: AttributeMap | undefined): AttributeMap | undefined {
  const result: AttributeMap = {}
  const attrs = attributes ?? {}
  const baseAttrs = base ?? {}
  for (const key in baseAttrs) {
    if (attrs[key] !== undefined && !fieldValuesEqual(attrs[key], baseAttrs[key])) {
      result[key] = baseAttrs[key]
    }
  }
  for (const key in attrs) {
    if (baseAttrs[key] === undefined && attrs[key] !== null) {
      result[key] = null
    }
  }
  return nonEmpty(result)
}

/** Format attributes turning marks `a` into marks `b` (`null` for removed keys). */
export function diffAttributes(a: AttributeMap | undefined, b: AttributeMap | undefined): AttributeMap | undefined {
  const result: AttributeMap = {}
  const from = a ?? {}
  const to = b ?? {}
  for (const key in from) {
    if (to[key] === undefined) {
      result[key] = null
    }
  }
  for (const key in to) {
    if (!fieldValuesEqual(from[key], to[key])) {
      result[key] = to[key]
    }
  }
  return nonEmpty(result)
}
