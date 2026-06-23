const MAX_DEEP_EQUAL_DEPTH = 32

/**
 * Compare two field values for structural equality.
 */
export function fieldValuesEqual(a: any, b: any): boolean {
  return deepEqual(a, b, new WeakMap(), 0)
}

/**
 * Recursive structural equality with cycle and depth guards.
 */
function deepEqual(a: any, b: any, visited: WeakMap<object, WeakSet<object>>, depth: number): boolean {
  if (Object.is(a, b)) {
    return true
  }
  if (a == null && b == null) {
    return true
  }
  if (a == null || b == null || typeof a !== typeof b) {
    return false
  }
  if (typeof a !== 'object') {
    return false
  }
  if (depth > MAX_DEEP_EQUAL_DEPTH) {
    return false
  }

  let pairs = visited.get(a as object)
  if (pairs?.has(b as object)) {
    return true
  }
  pairs ??= new WeakSet()
  pairs.add(b as object)
  visited.set(a as object, pairs)

  if (a instanceof Date || b instanceof Date) {
    if (!(a instanceof Date) || !(b instanceof Date)) {
      return false
    }
    const aTime = a.getTime()
    const bTime = b.getTime()
    return Number.isNaN(aTime) && Number.isNaN(bTime) ? true : aTime === bTime
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false
    }
    return a.every((value, index) => deepEqual(value, b[index], visited, depth + 1))
  }

  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) {
      return false
    }
    for (const [key, value] of a) {
      if (!b.has(key) || !deepEqual(value, b.get(key), visited, depth + 1)) {
        return false
      }
    }
    return true
  }

  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) {
      return false
    }
    for (const value of a) {
      if (!b.has(value)) {
        return false
      }
    }
    return true
  }

  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) {
    return false
  }
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) {
      return false
    }
    if (!deepEqual((a as any)[key], (b as any)[key], visited, depth + 1)) {
      return false
    }
  }
  return true
}
