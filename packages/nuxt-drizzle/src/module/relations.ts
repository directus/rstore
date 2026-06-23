import type { Collection, CollectionRelation } from '@rstore/shared'
import type { Relations, Table } from 'drizzle-orm'
import { createTableRelationsHelpers, is, Many, One } from 'drizzle-orm'

interface RelationContext {
  /** Drizzle relations declarations. */
  relationsList: Relations[]
  /** Generated collection lookup by Drizzle table. */
  collectionsByTable: WeakMap<Table, Collection>
  /** Resolve a Drizzle column to its table property key. */
  getColumnKey: (table: Table, column: any) => string
}

/** Apply Drizzle `relations()` metadata to generated rstore collections. */
export function applyDrizzleRelations(ctx: RelationContext) {
  const explicitOneRelations: Array<One> = []
  const implicitOneRelations: Array<{ collection: Collection, key: string, relation: One }> = []
  const implicitManyRelations: Array<{ collection: Collection, key: string, relation: Many<string> }> = []

  for (const relations of ctx.relationsList) {
    const collection = ctx.collectionsByTable.get(relations.table)
    if (!collection) {
      throw new Error(`Collection not found for table ${relations.table}`)
    }
    collectRelations(ctx, relations, collection, explicitOneRelations, implicitOneRelations, implicitManyRelations)
  }

  for (const relation of implicitOneRelations) {
    applyImplicitOneRelation(ctx, explicitOneRelations, relation)
  }
  for (const relation of implicitManyRelations) {
    applyImplicitManyRelation(ctx, explicitOneRelations, relation)
  }
}

function collectRelations(
  ctx: RelationContext,
  relations: Relations,
  collection: Collection,
  explicitOneRelations: One[],
  implicitOneRelations: Array<{ collection: Collection, key: string, relation: One }>,
  implicitManyRelations: Array<{ collection: Collection, key: string, relation: Many<string> }>,
) {
  const config = relations.config(createTableRelationsHelpers(relations.table))
  for (const key in config) {
    const relation = config[key]
    if (is(relation, One)) {
      if (!relation.config || !relation.config.fields[0] || !relation.config.references[0]) {
        implicitOneRelations.push({ collection, key, relation })
        continue
      }
      applyExplicitOneRelation(ctx, collection, key, relation)
      explicitOneRelations.push(relation)
    }
    else if (is(relation, Many)) {
      implicitManyRelations.push({ collection, key, relation })
    }
  }
}

function applyExplicitOneRelation(ctx: RelationContext, collection: Collection, key: string, relation: One) {
  const fields = relation.config!.fields
  const references = relation.config!.references
  if (fields.length > 1) {
    throw new Error('Relations with multiple fields are not supported yet, see https://github.com/Akryum/rstore/issues/7')
  }
  if (references.length > 1) {
    throw new Error('Relations with multiple references are not supported yet, see https://github.com/Akryum/rstore/issues/7')
  }
  const targetCollection = ctx.collectionsByTable.get(relation.referencedTable)
  if (!targetCollection) {
    throw new Error(`Target collection not found for table ${relation.referencedTableName}`)
  }
  collection.relations ??= {}
  collection.relations[key] = {
    to: {
      [targetCollection.name]: {
        on: {
          [ctx.getColumnKey(relation.referencedTable, references[0]!)]: ctx.getColumnKey(relation.sourceTable, fields[0]!),
        },
      },
    },
  }
}

function applyImplicitOneRelation(
  ctx: RelationContext,
  explicitOneRelations: One[],
  { collection, key, relation }: { collection: Collection, key: string, relation: One },
) {
  if (relation.relationName) {
    collection.relations ??= {}
    collection.relations[key] = createNamedImplicitRelation(ctx, explicitOneRelations, relation)
    return
  }
  collection.relations ??= {}
  collection.relations[key] = findInverseRelation(ctx, collection, relation)
}

function applyImplicitManyRelation(
  ctx: RelationContext,
  explicitOneRelations: One[],
  { collection, key, relation }: { collection: Collection, key: string, relation: Many<string> },
) {
  if (relation.relationName) {
    collection.relations ??= {}
    collection.relations[key] = {
      ...createNamedImplicitRelation(ctx, explicitOneRelations, relation),
      many: true,
    }
    return
  }
  collection.relations ??= {}
  collection.relations[key] = {
    ...findInverseRelation(ctx, collection, relation),
    many: true,
  }
}

function createNamedImplicitRelation(ctx: RelationContext, explicitOneRelations: One[], relation: One | Many<string>): CollectionRelation {
  const targetRelation = explicitOneRelations.find(r => r.relationName === relation.relationName)
  if (!targetRelation) {
    throw new Error(`Explicit relation not found for ${relation.relationName}`)
  }
  const targetCollection = ctx.collectionsByTable.get(targetRelation.referencedTable)
  if (!targetCollection) {
    throw new Error(`Target collection not found for table ${targetRelation.referencedTableName}`)
  }
  return {
    to: {
      [targetCollection.name]: {
        on: {
          [ctx.getColumnKey(relation.referencedTable, targetRelation.config!.fields[0]!)]: ctx.getColumnKey(relation.sourceTable, targetRelation.config!.references[0]!),
        },
      },
    },
  }
}

function findInverseRelation(ctx: RelationContext, collection: Collection, relation: One | Many<string>): CollectionRelation {
  const targetCollection = ctx.collectionsByTable.get(relation.referencedTable)
  if (!targetCollection) {
    throw new Error(`Target collection not found for table ${relation.referencedTableName}`)
  }
  if (!targetCollection.relations) {
    throw new Error(`Target collection ${targetCollection.name} has no relations`)
  }
  for (const relationKey in targetCollection.relations) {
    const inverse = invertRelationToCollection(targetCollection.relations[relationKey]!, collection.name, targetCollection.name)
    if (inverse) {
      return inverse
    }
  }
  throw new Error(`Reference relation not found for ${collection.name}`)
}

function invertRelationToCollection(relation: CollectionRelation, collectionName: string, targetCollectionName: string): CollectionRelation | undefined {
  for (const relationCollectionName in relation.to) {
    if (relationCollectionName !== collectionName) {
      continue
    }
    const targetToRaw = relation.to[relationCollectionName]!
    const targetToArray = Array.isArray(targetToRaw) ? targetToRaw : [targetToRaw]
    const targetTo = targetToArray[0]
    if (!targetTo) {
      continue
    }
    return {
      to: {
        [targetCollectionName]: {
          on: Object.fromEntries(Object.entries(targetTo.on).map(([key, value]) => [value, key])),
        },
      },
    }
  }
}
