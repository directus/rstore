/**
 * Maximum accepted length for a LIKE pattern. Patterns are client-supplied
 * (REST `where`, realtime subscription `where`) and are matched server-side
 * on every realtime frame, so an explicit cap keeps even the worst-case
 * `O(pattern × text)` matching cost bounded.
 */
export const MAX_LIKE_PATTERN_LENGTH = 512

/**
 * Matches a value against a SQL `LIKE` pattern (`%` = zero or more
 * characters, `_` = exactly one character) with full-string (anchored)
 * semantics, mirroring how the database evaluates `LIKE`.
 *
 * Implemented as an iterative two-pointer scan instead of a `RegExp` so
 * client-supplied patterns can neither inject regex metacharacters (ReDoS
 * such as `(a+)+$`) nor crash the matcher with invalid regex syntax — every
 * character other than `%` and `_` is a literal. Worst-case cost is
 * `O(pattern.length × text.length)` with no exponential backtracking.
 *
 * @param pattern The LIKE pattern (coerced to string).
 * @param value The value to test. `null`/`undefined` never match (SQL:
 * `NULL LIKE p` is not true). Other non-strings are coerced to strings.
 * @param caseInsensitive Lowercase both sides before matching (`ilike`, or
 * `like` on SQLite where ASCII matching is case-insensitive by default).
 * @returns `true` when the whole value matches the pattern.
 * @throws Error when the pattern exceeds {@link MAX_LIKE_PATTERN_LENGTH}.
 */
export function likeMatch(pattern: string, value: unknown, caseInsensitive = false): boolean {
  let p = String(pattern)
  if (p.length > MAX_LIKE_PATTERN_LENGTH) {
    throw new Error(`LIKE pattern too long (max ${MAX_LIKE_PATTERN_LENGTH} characters)`)
  }
  if (value == null) {
    return false
  }
  let text = String(value)
  if (caseInsensitive) {
    p = p.toLowerCase()
    text = text.toLowerCase()
  }

  // Two-pointer wildcard matching: on a mismatch after a `%`, rewind the
  // pattern to just after the last `%` and let it swallow one more input
  // character. Each rewind strictly advances `starT`, bounding total work.
  let pi = 0
  let ti = 0
  let starPi = -1
  let starTi = -1
  while (ti < text.length) {
    if (pi < p.length && (p[pi] === '_' || p[pi] === text[ti])) {
      pi++
      ti++
    }
    else if (pi < p.length && p[pi] === '%') {
      starPi = pi
      starTi = ti
      pi++
    }
    else if (starPi !== -1) {
      pi = starPi + 1
      starTi++
      ti = starTi
    }
    else {
      return false
    }
  }
  // Only trailing `%` may remain unconsumed.
  while (pi < p.length && p[pi] === '%') {
    pi++
  }
  return pi === p.length
}
