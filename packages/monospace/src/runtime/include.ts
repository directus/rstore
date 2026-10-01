import type { MonospaceRelationCollectionLike, MonospaceRelationStoreLike } from './relations'
import type { MonospaceSortInput } from './sort'
import { isRecord } from '@rstore/connector-toolkit'
import { getMonospacePrimaryKeys } from './collection'

/**
 * Options of one Monospace relation include (`include[relation][...]`).
 *
 * Accepted parameters depend on the relation: to-many relations accept
 * `filter`, `sort`, `limit` and `offset`, nullable to-one relations only
 * `filter`, and required to-one relations none of them.
 */
export interface MonospaceIncludeOptions {
  /**
   * Primitive fields selected on the related items, `*` for all of them.
   */
  fields?: string[] | string

  /**
   * Nested relation includes on the related items.
   */
  include?: MonospaceInclude

  /**
   * Monospace filter applied to the related items.
   */
  filter?: Record<string, any>

  /**
   * Sort applied to the related items.
   */
  sort?: MonospaceSortInput | MonospaceSortInput[]

  /**
   * Maximum number of related items per parent (`0` or `-1` for unlimited).
   */
  limit?: number

  /**
   * Number of related items to skip per parent.
   */
  offset?: number

  /**
   * Additional include parameters.
   */
  [key: string]: any
}

/**
 * Monospace `include` query parameter keyed by relation name.
 */
export type MonospaceInclude = Record<string, MonospaceIncludeOptions>

/**
 * Collection and store context used to resolve relation metadata.
 */
export interface MonospaceIncludeContext {
  /**
   * Collection the include applies to.
   */
  collection?: MonospaceRelationCollectionLike

  /**
   * Store used to resolve nested relation target collections.
   */
  store?: MonospaceRelationStoreLike
}

/**
 * Creates a Monospace `include` query object from an rstore `include` option.
 *
 * Included relations select every primitive field (`fields: ['*']`) and
 * nested rstore includes (`{ include: { ... } }` or the direct nested form)
 * map to nested Monospace includes. Raw Monospace include options (from
 * `params.include`) are merged on top, user values winning, then every
 * level is completed:
 * - a missing `fields` selection defaults to `['*']`, since Monospace
 *   rejects includes that select nothing;
 * - to-many relations get `limit: -1` unless a limit is set, because
 *   Monospace otherwise truncates them to 100 items per parent and the
 *   truncated lists would be cached;
 * - narrowed `fields` selections get the join, primary key, and nested
 *   relation backing columns the rstore cache needs.
 */
export function createMonospaceInclude(
  include: Record<string, any> | undefined,
  context: MonospaceIncludeContext = {},
  rawInclude?: MonospaceInclude,
): MonospaceInclude | undefined {
  const merged = mergeIncludes(convertRstoreInclude(include), rawInclude)
  if (!merged || !Object.keys(merged).length) {
    return undefined
  }
  return completeInclude(merged, context)
}

/**
 * Collects the parent-side FK columns backing the included relations.
 */
export function collectIncludeBackingFields(
  include: Record<string, any> | undefined,
  collection: MonospaceRelationCollectionLike | undefined,
): string[] {
  const fields: string[] = []
  for (const key in include) {
    if (!include[key]) {
      continue
    }
    const relation = collection?.normalizedRelations?.[key]
    for (const target of relation?.to ?? []) {
      fields.push(...Object.values(target.on))
    }
  }
  return fields
}

/**
 * Adds backing columns to a field selection unless it already selects `*`.
 *
 * Accepts the comma-separated string form and returns an array.
 */
export function withBackingFields(fields: string[] | string | undefined, backingFields: string[]): string[] {
  const list = typeof fields === 'string' ? fields.split(',').map(field => field.trim()) : fields
  const base = list?.length ? list : ['*']
  if (base.includes('*')) {
    return base
  }
  return [...new Set([...base, ...backingFields])]
}

/**
 * Converts an rstore include option into Monospace include entries.
 */
function convertRstoreInclude(include: Record<string, any> | undefined): MonospaceInclude | undefined {
  if (!isRecord(include)) {
    return undefined
  }

  const result: MonospaceInclude = {}
  for (const key in include) {
    const value = include[key]
    if (!value) {
      continue
    }
    const entry: MonospaceIncludeOptions = { fields: ['*'] }
    // Nested includes come either as `{ include: { ... } }` or directly as a
    // nested include map (`{ author: { todos: true } }`).
    const nested = convertRstoreInclude(isRecord(value) && isRecord(value.include) ? value.include : isRecord(value) ? value : undefined)
    if (nested && Object.keys(nested).length) {
      entry.include = nested
    }
    result[key] = entry
  }
  return result
}

/**
 * Deep-merges raw Monospace include options over generated ones.
 *
 * Nested `include` maps are merged recursively; any other option set by the
 * user replaces the generated value.
 */
function mergeIncludes(base: MonospaceInclude | undefined, override: MonospaceInclude | undefined): MonospaceInclude | undefined {
  if (!isRecord(override)) {
    return base
  }

  const result: MonospaceInclude = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (!isRecord(value)) {
      continue
    }
    const merged: MonospaceIncludeOptions = { ...result[key], ...value }
    const nested = mergeIncludes(result[key]?.include, value.include)
    if (nested) {
      merged.include = nested
    }
    result[key] = merged
  }
  return result
}

/**
 * Completes include entries with default fields, to-many limits, and the
 * columns the rstore cache needs to resolve relation joins.
 */
function completeInclude(include: MonospaceInclude, context: MonospaceIncludeContext): MonospaceInclude {
  const result: MonospaceInclude = {}
  for (const [key, options] of Object.entries(include)) {
    const relation = context.collection?.normalizedRelations?.[key]
    // Monospace relations have a single target; multi-target relations
    // cannot be resolved to one collection.
    const target = relation?.to.length === 1 ? relation.to[0] : undefined
    const targetCollection = target && context.store?.$collections?.find(other => other.name === target.collection)

    const entry: MonospaceIncludeOptions = { ...options }
    const nestedContext = { collection: targetCollection, store: context.store }
    if (isRecord(entry.include)) {
      entry.include = completeInclude(entry.include, nestedContext)
    }

    // Target-side join columns and primary keys let the rstore cache key
    // the related items and join them back to their parent.
    const backingFields = [
      ...Object.keys(target?.on ?? {}),
      ...(targetCollection ? getMonospacePrimaryKeys(targetCollection) : []),
      ...collectIncludeBackingFields(entry.include, targetCollection),
    ]
    entry.fields = withBackingFields(entry.fields, backingFields)

    if (relation?.many && entry.limit == null) {
      entry.limit = -1
    }
    result[key] = entry
  }
  return result
}
