import type { Collection, CollectionDefaults, CollectionRelation, CollectionRelationReference, CollectionRelations, CollectionSchemas, DefaultIsInstanceOf, Exactly, Full, GetKey, ResolvedCollection, ResolvedCollectionList, StandardSchemaV1, StoreCore, StoreSchema } from '@rstore/shared'

export const defaultGetKey: GetKey<any> = (item: any) => item.id ?? item.__id

export const defaultIsInstanceOf: DefaultIsInstanceOf = collection => item => item.__typename === collection.name

/**
 * Allow typing the collection item type thanks to currying.
 */
export function withItemType<
  TItem,
>(): {
  /**
   * Define a typed collection.
   */
  defineCollection: <
    const TCollection extends Exactly<Omit<Collection<TItem>, '~type' | '~item'>, TCollection>,
  > (collection: TCollection) => TCollection & {
    '~type': undefined
    '~item': TItem
  }
} {
  return {
    defineCollection: collection => collection as any,
  }
}

/**
 * Define an untyped collection.
 */
export function defineCollection(collection: Collection): Collection {
  return collection
}

export function defineRelations<
  TCollection extends Collection,
  const TRelations extends Exactly<Record<string, CollectionRelation<TCollection>>, TRelations>,
>(
  collection: TCollection,
  relations: (payload: {
    collection: <TTargetCollection extends Collection, T extends CollectionRelationReference<TCollection, TTargetCollection>> (collection: TTargetCollection, relation: T) => { [key in TTargetCollection['name']]: T & { '~collection': TTargetCollection } }
  }) => TRelations,
): CollectionRelations<TCollection, TRelations> {
  return {
    '~type': 'relation',
    collection,
    'relations': relations({
      collection: (collection, relation) => ({
        [collection.name]: relation,
      }) as any,
    }),
  }
}

export function emptySchema(): StandardSchemaV1 {
  return {
    '~standard': {
      validate: value => ({ value }),
      vendor: 'rstore',
      version: 1,
    },
  }
}

export const emptySchemas: Full<CollectionSchemas> = {
  create: emptySchema(),
  update: emptySchema(),
}

export function resolveCollection<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(collection: TCollection, defaults: TCollectionDefaults | undefined): ResolvedCollection<TCollection, TCollectionDefaults, TSchema> {
  if (collection.name.startsWith('$')) {
    throw new Error(`Collection name "${collection.name}" cannot start with "$"`)
  }

  const fields = defaults?.fields ?? {}
  if (collection.fields) {
    for (const path in collection.fields) {
      if (fields[path]) {
        Object.assign(fields[path], collection.fields[path])
      }
      else {
        fields[path] = collection.fields[path]
      }
    }
  }

  return {
    '~resolved': true,
    'name': collection.name,
    'getKey': item => item.$overrideKey ?? (collection.getKey ?? defaults?.getKey ?? defaultGetKey)(item),
    'isInstanceOf': item => collection.isInstanceOf?.(item) || defaults?.isInstanceOf?.(collection)(item) || defaultIsInstanceOf(collection)(item),
    'relations': collection.relations ?? {},
    'oppositeRelations': {},
    'indexes': new Map(),
    'computed': {
      ...defaults?.computed,
      ...collection.computed,
    },
    fields,
    'formSchema': {
      create: collection.formSchema?.create ?? emptySchemas.create,
      update: collection.formSchema?.update ?? emptySchemas.update,
    },
    'scopeId': collection.scopeId,
    'hooks': collection.hooks,
    'meta': {
      ...defaults?.meta,
      ...collection.meta,
    },
  }
}

export function isCollection(item: any): item is Collection {
  return item && (item['~type'] === 'collection' || item['~type'] === undefined)
}

export function isCollectionRelations(item: any): item is CollectionRelations {
  return item && item['~type'] === 'relation'
}

export function resolveCollections<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
>(schemaItems: TSchema, defaults?: TCollectionDefaults): ResolvedCollectionList<TSchema, TCollectionDefaults> {
  const resolved = [] as ResolvedCollectionList<TSchema, TCollectionDefaults>

  for (const item of schemaItems) {
    if (isCollection(item)) {
      resolved.push(resolveCollection(item, defaults))
    }
  }

  return resolved
}

export function addCollectionRelations<
  TSchema extends StoreSchema,
>(store: StoreCore<TSchema>, relations: CollectionRelations): void {
  const collection = store.$collections.find(m => m.name === relations.collection.name)
  if (!collection) {
    throw new Error(`Collection "${relations.collection.name}" not found in store`)
  }
  collection.relations ??= {}
  Object.assign(collection.relations, relations.relations)
}

export function normalizeCollectionRelations(collections: ResolvedCollection[]): void {
  for (const collection of collections) {
    if (!collection.relations) {
      continue
    }
    for (const relationKey in collection.relations) {
      const relation = collection.relations[relationKey]!
      for (const toCollectionName in relation.to) {
        const newOn = {} as Record<string, string>
        const on = relation.to[toCollectionName]!.on as Record<string, string>
        for (const key in on) {
          const oppositeKey = key.replace(`${toCollectionName}.`, '')
          const currentKey = on[key]!.replace(`${collection.name}.`, '')
          newOn[oppositeKey] = currentKey
        }
        relation.to[toCollectionName]!.on = newOn
      }
    }
  }
}

/**
 * Populate opposite relations for a collection based on the store schema. Opposite relations are used to track which collections relate back to the current collection.
 *
 * This should be called after all collections (and their eventual separate relation definitions) are added to the store because it needs to lookup the current collection in all the other collections. It should also be called after normalizing relations to ensure the 'on' fields are in a consistent format (with `normalizeCollectionRelations`).
 */
export function resolveCollectionOppositeRelations(collections: ResolvedCollection[]): void {
  for (const collection of collections) {
    collection.oppositeRelations = {}
    const indexes = new Map<string, string[]>()
    for (const otherCollection of collections) {
      if (otherCollection.name === collection.name || !otherCollection.relations) {
        continue
      }
      for (const relationKey in otherCollection.relations) {
        const relation = otherCollection.relations[relationKey]!
        for (const toCollectionName in relation.to) {
          if (toCollectionName === collection.name) {
            const fields = Object.keys(relation.to[toCollectionName]!.on as Record<string, string>).sort()
            collection.oppositeRelations[otherCollection.name] = {
              relation,
              fields,
            }
            const indexField = fields.join(':')
            if (!indexes.has(indexField)) {
              indexes.set(indexField, fields)
            }
          }
        }
      }
    }
    collection.indexes = indexes
  }
}
