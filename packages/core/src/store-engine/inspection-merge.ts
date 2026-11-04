import type { CacheLayer } from '@rstore/shared'

/** Maximum merged fields; one overflow entry lets projectors report truncation. */
const MAX_MERGED_FIELDS = 1001

/** Recognize addresses ordered numerically by ordinary object enumeration. */
function isArrayIndex(address: string): boolean {
  const index = Number(address)
  return Number.isInteger(index) && index >= 0 && index < 4_294_967_295 && String(index) === address
}

/** Enumerate own addresses without reading values or allocating all row keys. */
function* ownAddresses(state: Record<string, unknown>): Generator<string> {
  for (const address in state) {
    if (Object.hasOwn(state, address))
      yield address
  }
}

/** Merge field streams in object order using only one cursor per source. */
function* mergedAddresses(states: Record<string, unknown>[]): Generator<string> {
  const cursors = states.map((state) => {
    const iterator = ownAddresses(state)
    return { iterator, next: iterator.next() }
  })
  while (true) {
    let selected = -1
    for (let index = 0; index < cursors.length; index++) {
      const candidate = cursors[index]!.next
      if (candidate.done)
        continue
      if (selected === -1 || (isArrayIndex(candidate.value)
        && (!isArrayIndex(cursors[selected]!.next.value!) || Number(candidate.value) < Number(cursors[selected]!.next.value!)))) {
        selected = index
      }
    }
    if (selected === -1)
      return
    const cursor = cursors[selected]!
    const address = cursor.next.value!
    // Earlier sources already emitted this field. Non-enumerable properties
    // never emitted it and cannot hide an enumerable overlay field.
    const duplicate = states.some((state, index) => index < selected && Object.getOwnPropertyDescriptor(state, address)?.enumerable)
    if (!duplicate)
      yield address
    cursor.next = cursor.iterator.next()
  }
}

/**
 * Merge a base row with its overlay patches for diagnostics.
 *
 * Descriptors are copied instead of values, so accessors are never invoked,
 * and the number of reflected fields is bounded. The topmost layer is exposed
 * as `$layer`, like an ordinary resolved read.
 */
export function mergeInspectionValues(values: unknown[], layer: CacheLayer): { value: object, truncated: boolean } {
  const states = values.filter(value => value != null).map(value => new Object(value) as Record<string, unknown>)
  const value = Object.create(null)
  let fields = 0
  let truncated = false
  for (const key of mergedAddresses(states)) {
    if (fields++ >= MAX_MERGED_FIELDS) {
      truncated = true
      break
    }
    // Later sources take precedence, as in layer resolution.
    for (let index = states.length - 1; index >= 0; index--) {
      const descriptor = Object.getOwnPropertyDescriptor(states[index]!, key)
      if (descriptor?.enumerable) {
        Object.defineProperty(value, key, { ...descriptor, configurable: true })
        break
      }
    }
  }
  Object.defineProperty(value, '$layer', { enumerable: true, configurable: true, value: layer })
  return { value, truncated }
}

/** Resolve known scalar identity from data descriptors, never application key callbacks. */
export function resolveInspectionKey(address: string, value: unknown): string | number {
  if (value !== null && typeof value === 'object') {
    try {
      // These conventional identity fields preserve useful numeric/string hints.
      // An accessor or opaque custom key must fall back to the stored address.
      for (const field of ['$overrideKey', 'id', '__id']) {
        const descriptor = Object.getOwnPropertyDescriptor(value, field)
        if (descriptor && !('value' in descriptor))
          return address
        const key = descriptor?.value
        if (key == null)
          continue
        return (typeof key === 'string' || typeof key === 'number') && String(key) === address ? key : address
      }
    }
    catch {
      // Hostile reflection cannot turn diagnostic identity into application work.
    }
  }
  return address
}
