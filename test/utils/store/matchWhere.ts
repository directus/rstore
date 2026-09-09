/**
 * Minimal, hand-written filter matcher for the fake backends used by
 * integration tests.
 *
 * It is deliberately NOT `@rstore/connector-toolkit`'s engine: the store's
 * cache filtering runs on that engine, so a fake backend sharing it would
 * make any server/cache divergence invisible. Keeping a separate, explicit
 * implementation here means a mismatch shows up as a failing test.
 */

/** Comparison operators understood by {@link matchWhere}. */
export interface WhereOperators {
  $eq?: any
  $ne?: any
  $in?: any[]
  $nin?: any[]
  $gt?: any
  $gte?: any
  $lt?: any
  $lte?: any
  /** SQL-style pattern with `%` wildcards. */
  $like?: string
  /** `true` matches null/undefined, `false` matches anything else. */
  $null?: boolean
}

/** A `where` clause: field conditions plus `$and` / `$or` groups. */
export interface Where {
  $and?: Where[]
  $or?: Where[]
  [field: string]: any
}

/** Normalizes a value so `Date` and `null`/`undefined` compare predictably. */
function normalize(value: any): any {
  if (value instanceof Date) {
    return value.getTime()
  }
  return value === undefined ? null : value
}

/** Turns a SQL `%`/`_` pattern into an anchored regular expression. */
function likeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replace(/%/g, '.*').replace(/_/g, '.')}$`)
}

/**
 * Comparison implementations, keyed by operator name.
 *
 * `left` is the normalized item value, `right` the normalized operand and
 * `raw` the untouched operand (needed by `$like` and `$in`).
 */
const OPERATORS: Record<string, (left: any, right: any, raw: any) => boolean> = {
  $eq: (left, right) => left === right,
  $ne: (left, right) => left !== right,
  $in: (left, _right, raw) => (raw as any[]).map(normalize).includes(left),
  $nin: (left, _right, raw) => !(raw as any[]).map(normalize).includes(left),
  // Comparisons against null are false, like SQL three-valued logic.
  $gt: (left, right) => left !== null && right !== null && left > right,
  $gte: (left, right) => left !== null && right !== null && left >= right,
  $lt: (left, right) => left !== null && right !== null && left < right,
  $lte: (left, right) => left !== null && right !== null && left <= right,
  $like: (left, _right, raw) => typeof left === 'string' && likeToRegExp(raw as string).test(left),
  $null: (left, _right, raw) => (left === null) === raw,
}

/** Applies one operator object to a single field value. */
function matchOperators(value: any, operators: WhereOperators): boolean {
  const left = normalize(value)
  for (const [operator, operand] of Object.entries(operators)) {
    const compare = OPERATORS[operator]
    if (!compare) {
      throw new Error(`Unsupported where operator: ${operator}`)
    }
    if (!compare(left, normalize(operand), operand)) {
      return false
    }
  }
  return true
}

/**
 * Returns whether `item` satisfies `where`.
 *
 * @param item The row to test.
 * @param where Field conditions, optionally grouped with `$and` / `$or`.
 */
export function matchWhere(item: Record<string, any>, where: Where | undefined | null): boolean {
  if (!where) {
    return true
  }
  for (const [field, condition] of Object.entries(where)) {
    if (field === '$and') {
      if (!(condition as Where[]).every(sub => matchWhere(item, sub))) {
        return false
      }
      continue
    }
    if (field === '$or') {
      if (!(condition as Where[]).some(sub => matchWhere(item, sub))) {
        return false
      }
      continue
    }
    const isOperatorObject = condition != null
      && typeof condition === 'object'
      && !Array.isArray(condition)
      && !(condition instanceof Date)
    if (isOperatorObject) {
      if (!matchOperators(item[field], condition as WhereOperators)) {
        return false
      }
      continue
    }
    if (normalize(item[field]) !== normalize(condition)) {
      return false
    }
  }
  return true
}

/** Sorts rows in place from an `orderBy` list such as `['title', '-id']`. */
export function applyOrderBy<T extends Record<string, any>>(rows: T[], orderBy: string | string[] | undefined): T[] {
  if (!orderBy) {
    return rows
  }
  const fields = Array.isArray(orderBy) ? orderBy : [orderBy]
  return [...rows].sort((a, b) => {
    for (const field of fields) {
      const desc = field.startsWith('-')
      const name = desc ? field.slice(1) : field
      const left = normalize(a[name])
      const right = normalize(b[name])
      if (left === right) {
        continue
      }
      const result = left === null ? -1 : right === null ? 1 : left < right ? -1 : 1
      return desc ? -result : result
    }
    return 0
  })
}
