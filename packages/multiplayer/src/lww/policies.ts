import type { FieldConflict, MergeResult } from './types.js'

/** Outcome chosen for one equal-stamp conflict. */
export type ConflictResolution
  /** Keep the stored value. */
  = | 'local'
  /** Take the incoming value. */
    | 'remote'
  /** Store a custom value, e.g. a merge of both. */
    | { value: unknown }

/** Input of a {@link ConflictPolicyFunction}. */
export interface ConflictPolicyContext {
  /** Collection name of the written item. */
  collection: string
  /** Key of the written item. */
  key: string | number
  /** The conflicting field. */
  conflict: FieldConflict
}

/**
 * Custom conflict resolution. Returning `undefined` leaves the conflict to the
 * default `'lww'` behaviour (keep the stored value and report it).
 */
export type ConflictPolicyFunction = (context: ConflictPolicyContext) => ConflictResolution | undefined

/**
 * How a field written with the same stamp but a different value is resolved:
 *
 * - `'lww'` (default): keep the stored value and report the conflict.
 * - `'local-wins'`: keep the stored value silently.
 * - `'remote-wins'`: take the incoming value silently.
 * - a function: decide per field; see {@link ConflictPolicyFunction}.
 */
export type ConflictPolicy = 'lww' | 'local-wins' | 'remote-wins' | ConflictPolicyFunction

/**
 * Apply a conflict policy to the result of `mergeItemFields`.
 *
 * `mergeItemFields` keeps the local value of every conflicting field. This
 * rewrites `result.merged` for the conflicts the policy resolves and returns
 * the ones left to report (an empty array when all are resolved).
 *
 * @param result Merge result to update in place; its `merged` object must be owned by the caller.
 * @param policy Policy to apply.
 * @param target Item the conflicts belong to, passed to a policy function.
 * @param target.collection Collection name of the item.
 * @param target.key Key of the item.
 * @returns The conflicts that remain unresolved.
 */
export function applyConflictPolicy(
  result: MergeResult,
  policy: ConflictPolicy,
  target: { collection: string, key: string | number },
): FieldConflict[] {
  if (policy === 'lww' || !result.conflicts.length) {
    return result.conflicts
  }
  if (policy === 'local-wins') {
    return []
  }
  const unresolved: FieldConflict[] = []
  for (const conflict of result.conflicts) {
    const resolution = policy === 'remote-wins'
      ? 'remote'
      : policy({ collection: target.collection, key: target.key, conflict })
    if (resolution === 'remote') {
      result.merged[conflict.field] = conflict.remoteValue
    }
    else if (resolution != null && typeof resolution === 'object') {
      result.merged[conflict.field] = resolution.value
    }
    else if (resolution !== 'local') {
      unresolved.push(conflict)
    }
  }
  return unresolved
}
