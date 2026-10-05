/**
 * Sanitization for remote multiplayer updates.
 *
 * Room members are not trusted: an incoming update is only spread into the
 * local form/cache after prototype-polluting keys are removed and — when a
 * tracked-field list is known — unknown fields are dropped.
 */

/** Keys that can reach the prototype chain via assignment paths. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Returns a copy of `update` safe to merge into local state:
 * - `__proto__` / `constructor` / `prototype` keys are always removed
 *   (JSON.parse can produce them as own properties);
 * - when `allowedKeys` is provided, keys outside it are dropped.
 *
 * Returns `null` when nothing survives sanitization, so callers can skip
 * the merge entirely.
 *
 * @param update Raw update payload received from a peer.
 * @param allowedKeys Optional allowlist of field names (e.g. `trackedFields`).
 */
export function sanitizeMultiplayerUpdate<TUpdate extends Record<string, any>>(
  update: TUpdate,
  allowedKeys?: readonly string[],
): Partial<TUpdate> | null {
  const allowed = allowedKeys ? new Set<string>(allowedKeys) : null
  const sanitized: Record<string, any> = {}
  let kept = 0

  for (const key of Object.keys(update)) {
    if (FORBIDDEN_KEYS.has(key)) {
      continue
    }
    if (allowed && !allowed.has(key)) {
      continue
    }
    sanitized[key] = update[key]
    kept++
  }

  return kept > 0 ? sanitized as Partial<TUpdate> : null
}
