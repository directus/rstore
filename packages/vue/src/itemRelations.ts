import type { Cache, ResolvedCollection } from '@rstore/shared'

/** Dependencies for one wrapper-local normalized relation reader. */
export interface CreateItemRelationReaderOptions {
  /** Vue cache used for indexed target reads. */
  cache: Cache
  /** Source collection containing relation fields. */
  collection: ResolvedCollection<any, any, any>
  /** Stable wrapped proxy used by computed fields and filters. */
  proxy: any
  /** Normalized relation definition. */
  relation: any
  /** Resolve target collection once while creating reader. */
  getCollection: (name: string) => ResolvedCollection<any, any, any>
}

/** Build one wrapper-local relation reader with pre-resolved targets. */
export function createItemRelationReader(options: CreateItemRelationReaderOptions): (current: any) => any {
  const { cache, collection, proxy, relation, getCollection } = options
  const targets = relation.to.map((target: any) => ({
    target,
    collection: getCollection(target.collection),
    filter: target.filter ? (item: any) => target.filter(proxy, item) : undefined,
  }))

  /** Read one target bucket from current source snapshot. */
  function readTarget(config: typeof targets[number], current: any): any[] | undefined {
    const indexValue = readIndexValue(config.target, current, proxy, collection)
    if (indexValue === undefined)
      return undefined
    return cache.readItems({
      collection: config.collection,
      indexKey: config.target.indexKey,
      indexValue,
      limit: relation.many ? undefined : 1,
      filter: config.filter,
    }) as any[]
  }

  if (targets.length === 1) {
    const target = targets[0]!
    return (current) => {
      const result = readTarget(target, current) ?? []
      return relation.many ? result : result[0]
    }
  }

  return (current) => {
    const result: any[] = []
    for (const target of targets) {
      const values = readTarget(target, current)
      if (values)
        result.push(...values)
    }
    return relation.many ? result : result[0]
  }
}

/** Read complete relation index values from one sampled item snapshot. */
function readIndexValue(
  target: any,
  current: any,
  proxy: any,
  collection: ResolvedCollection<any, any, any>,
): string | any[] | undefined {
  if (target.indexFields.length === 1) {
    const value = readSourceValue(target.on[target.indexFields[0]!], current, proxy, collection)
    return value == null ? undefined : String(value)
  }
  const values: any[] = []
  for (const indexField of target.indexFields) {
    const value = readSourceValue(target.on[indexField]!, current, proxy, collection)
    if (value == null)
      return undefined
    values.push(value)
  }
  return values
}

/** Resolve a plain source field directly and computed field through proxy. */
function readSourceValue(
  key: string,
  current: any,
  proxy: any,
  collection: ResolvedCollection<any, any, any>,
): any {
  return key in collection.computed ? Reflect.get(proxy, key) : Reflect.get(current, key)
}
