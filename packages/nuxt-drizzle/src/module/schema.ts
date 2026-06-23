import type { Collection } from '@rstore/shared'
import type { Config as DrizzleKitConfig } from 'drizzle-kit'
import type { Table } from 'drizzle-orm'
import type { Jiti } from 'jiti'
import type { AllTableConfig, Column } from './types'
import { getTableName, is, isTable, Relations } from 'drizzle-orm'
import { applyDrizzleRelations } from './relations'

interface DrizzleTableEntry {
  /** Schema export key. */
  key: string
  /** Drizzle table object. */
  table: Table
  /** Database table name. */
  tableName: string
  /** Dialect-specific table config. */
  config: AllTableConfig | undefined
}

/** Create a deduped collection loader for the configured Drizzle schema file. */
export function createCollectionsLoader({
  jiti,
  drizzleSchemaPath,
  drizzleConfig,
  scopeId,
}: {
  jiti: Jiti
  drizzleSchemaPath: string
  drizzleConfig: DrizzleKitConfig
  scopeId: string
}) {
  return useDedupePromise(async () => {
    const schema = { ...(await jiti.import(drizzleSchemaPath)) as any }
    const collections: Collection[] = []
    const collectionsByTable = new WeakMap<Table, Collection>()
    const tables: DrizzleTableEntry[] = []
    const relationsList: Relations[] = []

    for (const key in schema) {
      const schemaItem = schema[key]
      if (isTable(schemaItem)) {
        tables.push({
          key,
          table: schemaItem,
          tableName: getTableName(schemaItem),
          config: await getTableConfigForDialect(drizzleConfig, schemaItem),
        })
      }
      else if (is(schemaItem, Relations)) {
        relationsList.push(schemaItem)
      }
    }

    for (const entry of tables) {
      const collection = createCollectionFromTable(entry, scopeId)
      collections.push(collection)
      collectionsByTable.set(entry.table, collection)
    }

    applyDrizzleRelations({
      relationsList,
      collectionsByTable,
      getColumnKey,
    })

    return collections
  })
}

/** Resolve a Drizzle column object back to the table property key. */
export function getColumnKey(table: Table, column: Column) {
  for (const key in table) {
    if (table[key as keyof Table] === column) {
      return key
    }
  }
  return column.name
}

function useDedupePromise<TFn extends () => Promise<any>>(fn: TFn) {
  let promise: ReturnType<TFn> | null = null
  return () => {
    if (!promise) {
      promise = fn() as ReturnType<TFn>
      promise.finally(() => {
        promise = null
      })
    }
    return promise
  }
}

function createCollectionFromTable({ key, table, tableName, config }: DrizzleTableEntry, scopeId: string): Collection {
  return {
    '~type': 'collection',
    'name': key,
    'scopeId': scopeId,
    'meta': {
      table: tableName,
      primaryKeys: config?.primaryKeys?.length
        ? config.primaryKeys[0]!.columns.map(col => getColumnKey(table, col))
        : config?.columns?.filter(col => col.primary).map(col => getColumnKey(table, col)) ?? [],
    },
  }
}

async function getTableConfigForDialect(drizzleConfig: DrizzleKitConfig, schemaItem: Table): Promise<AllTableConfig | undefined> {
  switch (drizzleConfig.dialect) {
    case 'postgresql': {
      const { getTableConfig } = await import('drizzle-orm/pg-core')
      return getTableConfig(schemaItem) as any
    }
    case 'mysql': {
      const { getTableConfig } = await import('drizzle-orm/mysql-core')
      return getTableConfig(schemaItem as any) as any
    }
    case 'sqlite': {
      const { getTableConfig } = await import('drizzle-orm/sqlite-core')
      return getTableConfig(schemaItem) as any
    }
    case 'singlestore': {
      const { getTableConfig } = await import('drizzle-orm/singlestore-core')
      return getTableConfig(schemaItem as any) as any
    }
  }
}
