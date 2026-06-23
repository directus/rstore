/**
 * Check whether two partial items refer to the same entity.
 */
export function itemsMatch(a: any, b: any): boolean {
  if (a === b)
    return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object')
    return false
  if (Array.isArray(a) || Array.isArray(b))
    return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  const [checkKeys, other] = keysA.length <= keysB.length ? [keysA, b] : [keysB, a]
  return checkKeys.length > 0 && checkKeys.every(k => k in other && a[k] === other[k])
}
