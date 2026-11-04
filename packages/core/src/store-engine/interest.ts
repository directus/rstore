import type { KeyId } from './internal-types.js'
import type { EngineChangeInterest } from './observer-changes.js'

/** Match a canonical item identity against exact or collection-wide interest. */
export function matchesItemInterest(
  interest: true | EngineChangeInterest | undefined,
  collection: string,
  key: KeyId,
): boolean {
  if (interest === true) {
    return true
  }
  const keys = interest?.itemKeys.get(collection)
  return keys === true || Boolean(keys?.has(key))
}
