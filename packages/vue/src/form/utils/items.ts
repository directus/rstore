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
  // The smaller item drives the comparison, so a partial item matches the full
  // one it describes. Both sides of the comparison must follow that choice,
  // otherwise the larger item is compared with itself and always matches.
  const [checkKeys, source, other] = keysA.length <= keysB.length ? [keysA, a, b] : [keysB, b, a]
  return checkKeys.length > 0 && checkKeys.every(k => k in other && source[k] === other[k])
}
