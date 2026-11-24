import type { VuePluginSetupApi } from '@rstore/vue'
import type { DrizzlePluginContext } from './context'
import { exactCacheScope } from '../utils/query-cache'

/** Register opt-in scope indexing and connector-proven create placement. */
export function installQueryCacheHooks(ctx: Pick<DrizzlePluginContext, 'dialect' | 'cacheScopeFields'>, hook: VuePluginSetupApi['hook']) {
  const scopes = ctx.cacheScopeFields ?? {}
  hook('init', ({ store }) => {
    for (const collection of store.$collections) {
      const field = scopes[collection.name]
      if (field)
        collection.indexes.set(field, [field])
    }
  })

  hook('resolveFindOptions', ({ collection, findOptions, many, updateFindOptions }) => {
    if (!many || !findOptions || findOptions.resultMode === 'responseRefs' || findOptions.fetchPolicy === 'no-cache'
      || findOptions.pageIndex != null || findOptions.pageSize != null || findOptions.filter
      || findOptions.cacheScope || Object.keys(findOptions.params ?? {}).some(key => key !== 'orderBy')) {
      return
    }
    const scope = exactCacheScope(findOptions.where)
    if (scope && scopes[collection.name] === scope.field)
      updateFindOptions({ cacheScope: scope })
  })

  hook('resolveCreatePlacement', ({ collection, findOptions, meta, row, rows, setPlacement }) => {
    if (!('drizzleLocalCreatePlacement' in meta) || meta.drizzleLocalCreatePlacement !== true || ctx.dialect !== 'sqlite'
      || findOptions.filter || Object.keys(findOptions.params ?? {}).some(key => key !== 'orderBy')) {
      return
    }
    const scope = exactCacheScope(findOptions.where)
    if (!scope || row[scope.field] !== scope.value)
      return
    const ordering = (findOptions.params as { orderBy?: string[] } | undefined)?.orderBy
    const fields = ordering?.map(value => /^(\w+)\.(asc|desc)$/.exec(value))
    const primaryKeys = collection.meta?.primaryKeys ?? ['id']
    if (!fields?.length || fields.some(field => !field) || primaryKeys.length !== 1 || fields.at(-1)?.[1] !== primaryKeys[0])
      return

    const key = collection.getKey(row)
    if (key == null || compareRows(fields, row, row) === undefined)
      return
    let before: string | number | undefined
    for (const candidate of rows) {
      const comparison = compareRows(fields, row, candidate)
      const candidateKey = collection.getKey(candidate)
      if (comparison === undefined || candidateKey == null || String(candidateKey) === String(key))
        return
      if (comparison < 0 && before === undefined)
        before = candidateKey
    }
    if (before !== undefined)
      setPlacement({ before })
    else if (rows.length < (findOptions.pageSize ?? Infinity))
      setPlacement('end')
  })
}

/** Compare concrete integer or plain ASCII values under SQLite's default ordering. */
function compareRows(fields: Array<RegExpExecArray | null>, left: Record<string, unknown>, right: Record<string, unknown>): number | undefined {
  let result = 0
  for (const field of fields) {
    const a = left[field![1]!]
    const b = right[field![1]!]
    if (typeof a === 'number' && typeof b === 'number' && Number.isSafeInteger(a) && Number.isSafeInteger(b))
      result ||= (a < b ? -1 : Number(a > b)) * (field![2] === 'desc' ? -1 : 1)
    else if (typeof a === 'string' && typeof b === 'string' && /^[\x20-\x7E]*$/.test(a) && /^[\x20-\x7E]*$/.test(b))
      result ||= (a < b ? -1 : Number(a > b)) * (field![2] === 'desc' ? -1 : 1)
    else
      return
  }
  return result
}
