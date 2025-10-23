import type { Collection, CollectionRelation, CustomCollectionMeta } from '@rstore/shared'
import type { Config as DrizzleKitConfig } from 'drizzle-kit'
import type { getTableConfig as mysqlGetTableConfig } from 'drizzle-orm/mysql-core'
import type { getTableConfig as pgGetTableConfig } from 'drizzle-orm/pg-core'
import type { getTableConfig as singleStoreGetTableConfig } from 'drizzle-orm/singlestore-core'
import type { getTableConfig as sqliteGetTableConfig } from 'drizzle-orm/sqlite-core'
import fs from 'node:fs'
import { addImports, addImportsDir, addServerHandler, addServerImports, addServerTemplate, addTemplate, addTypeTemplate, createResolver, defineNuxtModule, updateTemplates, useLogger } from '@nuxt/kit'
import { createTableRelationsHelpers, getTableName, is, isTable, Many, One, Relations, type Table, type TableConfig } from 'drizzle-orm'
import { createJiti } from 'jiti'
import path from 'pathe'

export type * from './runtime/types'

export interface ModuleOptions {
  /**
   * Path to the drizzle config file
   */
  drizzleConfigPath?: string

  /**
   * Import name for the function that returns the drizzle instance
   *
   * @default { name: 'useDrizzle', from '~~/server/utils/drizzle' }
   */
  drizzleImport?: {
    name: string
    from: string
  }

  /**
   * Generated REST API path
   *
   * @default '/api/rstore'
   */
  apiPath?: string
}

type AllTableConfig = TableConfig & (
  ReturnType<typeof pgGetTableConfig> |
  ReturnType<typeof mysqlGetTableConfig> |
  ReturnType<typeof sqliteGetTableConfig> |
  ReturnType<typeof singleStoreGetTableConfig>
)

type Column = AllTableConfig['columns'][number]

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'rstore-nuxt-drizzle',
    configKey: 'rstoreDrizzle',
    compatibility: {
      nuxt: '^3.19.2 || >=4.1.2',
    },
  },
  moduleDependencies: {
    '@rstore/nuxt': {},
  },
  defaults: {},
  async setup(options, nuxt) {
    const log = useLogger('rstore-drizzle')
    const { resolve } = createResolver(import.meta.url)

    // Add global types
    nuxt.hook('prepare:types', ({ references }) => {
      references.push({ path: resolve('./runtime/types.ts') })
    })

    const apiPath = options.apiPath ?? '/api/rstore'

    // Add files to nuxt app
    addServerHandler({
      handler: resolve('./runtime/server/api/index.get'),
      route: `${apiPath}/:collection`,
      method: 'get',
    })
    addServerHandler({
      handler: resolve('./runtime/server/api/index.post'),
      route: `${apiPath}/:collection`,
      method: 'post',
    })
    addServerHandler({
      handler: resolve('./runtime/server/api/[key]/index.get'),
      route: `${apiPath}/:collection/:key`,
      method: 'get',
    })
    addServerHandler({
      handler: resolve('./runtime/server/api/[key]/index.patch'),
      route: `${apiPath}/:collection/:key`,
      method: 'patch',
    })
    addServerHandler({
      handler: resolve('./runtime/server/api/[key]/index.delete'),
      route: `${apiPath}/:collection/:key`,
      method: 'delete',
    })
    addImportsDir(resolve('./runtime/utils'))
    addImports([
      'filterWhere',
    ].map(name => ({ name, from: resolve('./runtime/where') })))
    addServerImports([
      'rstoreDrizzleHooks',
      'hooksForTable',
      'allowTables',
    ].map(name => ({ from: resolve('./runtime/server/utils/hooks'), name })))

    const jiti = createJiti(import.meta.url, {
      moduleCache: false,
    })

    const drizzleConfigPath = options.drizzleConfigPath ?? 'drizzle.config.ts'
    const drizzleConfigFullPath = path.resolve(nuxt.options.rootDir, drizzleConfigPath)

    if (!fs.existsSync(drizzleConfigFullPath)) {
      log.warn(`Drizzle config not found, skipping drizzle module (looking for ${drizzleConfigPath})`)
      return
    }

    const drizzleConfig = (await jiti.import(drizzleConfigFullPath) as { default: DrizzleKitConfig }).default
    if (!drizzleConfig) {
      throw new Error('No drizzle config found')
    }

    if (typeof drizzleConfig.schema !== 'string') {
      throw new TypeError('Drizzle schema must be a single file path')
    }
    const drizzleSchemaPath = path.resolve(nuxt.options.rootDir, drizzleConfig.schema)

    function useDedupePromise<TFn extends () => Promise<any>>(fn: TFn) {
      let promise: Promise<ReturnType<TFn>> | null = null
      return () => {
        if (!promise) {
          promise = fn()
          promise.finally(() => {
            promise = null
          })
        }
        return promise
      }
    }

    const getCollectionsFromDrizzleSchema = useDedupePromise(async () => {
      const schema = { ...(await jiti.import(drizzleSchemaPath)) as any }

      const collections: Collection[] = []
      const collectionsByTable = new WeakMap<Table, Collection>()

      const tables: Array<{ key: string, table: Table, tableName: string, config: AllTableConfig | undefined }> = []
      const relationsList: Array<Relations> = []

      for (const key in schema) {
        const schemaItem = schema[key]
        if (isTable(schemaItem)) {
          let config: AllTableConfig | undefined

          switch (drizzleConfig.dialect) {
            case 'postgresql': {
              const { getTableConfig } = await import('drizzle-orm/pg-core')
              config = getTableConfig(schemaItem) as any
              break
            }
            case 'mysql': {
              const { getTableConfig: getMySqlTableConfig } = await import('drizzle-orm/mysql-core')
              config = getMySqlTableConfig(schemaItem as any) as any
              break
            }
            case 'sqlite': {
              const { getTableConfig: getSqliteTableConfig } = await import('drizzle-orm/sqlite-core')
              config = getSqliteTableConfig(schemaItem) as any
              break
            }
            case 'singlestore': {
              const { getTableConfig: getSingleStoreTableConfig } = await import('drizzle-orm/singlestore-core')
              config = getSingleStoreTableConfig(schemaItem as any) as any
              break
            }
          }

          const table = {
            key,
            table: schemaItem,
            tableName: getTableName(schemaItem),
            config,
          }
          tables.push(table)
        }
        else if (is(schemaItem, Relations)) {
          relationsList.push(schemaItem)
        }
      }

      function getColumnKey(table: Table, column: Column) {
        for (const key in table) {
          if (table[key as keyof Table] === column) {
            return key
          }
        }
        return column.name
      }

      for (const { key, table, tableName, config } of tables) {
        const collection: Collection = {
          '~type': 'collection',
          'name': key,
          'scopeId': 'rstore-drizzle',
          'meta': {
            table: tableName,
            primaryKeys: config?.primaryKeys?.length ? config.primaryKeys[0]!.columns.map(col => getColumnKey(table, col)) : config?.columns?.filter(col => col.primary).map(col => getColumnKey(table, col)) ?? [],
          },
        }
        collections.push(collection)
        collectionsByTable.set(table, collection)
      }

      const explicitOneRelations: Array<One> = []
      const implicitOneRelations: Array<{ collection: Collection, key: string, relation: One }> = []
      const implicitManyRelations: Array<{ collection: Collection, key: string, relation: Many<string> }> = []

      for (const relations of relationsList) {
        const collection = collectionsByTable.get(relations.table)
        if (!collection) {
          throw new Error(`Collection not found for table ${relations.table}`)
        }

        const config = relations.config(createTableRelationsHelpers(relations.table))

        // Explicit "to one" relations
        for (const key in config) {
          const relation = config[key]
          if (is(relation, One)) {
            if (relation.config) {
              const fields = relation.config.fields
              if (!fields[0]) {
                implicitOneRelations.push({ collection, key, relation })
                continue
              }
              if (fields.length > 1) {
                throw new Error(`Relations with multiple fields are not supported yet, see https://github.com/Akryum/rstore/issues/7`)
              }
              const references = relation.config.references
              if (!references[0]) {
                implicitOneRelations.push({ collection, key, relation })
                continue
              }
              if (references.length > 1) {
                throw new Error(`Relations with multiple references are not supported yet, see https://github.com/Akryum/rstore/issues/7`)
              }

              const targetCollection = collectionsByTable.get(relation.referencedTable)
              if (!targetCollection) {
                throw new Error(`Target collection not found for table ${relation.referencedTableName}`)
              }

              collection.relations ??= {}
              collection.relations[key] = {
                to: {
                  [targetCollection.name]: {
                    on: {
                      [getColumnKey(relation.referencedTable, references[0])]: getColumnKey(relation.sourceTable, fields[0]),
                    },
                  },
                },
              }
              explicitOneRelations.push(relation)
            }
            else {
              implicitOneRelations.push({ collection, key, relation })
            }
          }
          else if (is(relation, Many)) {
            implicitManyRelations.push({ collection, key, relation })
          }
        }
      }

      // Implicit "to one" relations
      for (const { collection, key, relation } of implicitOneRelations) {
        // Explicit relation name
        if (relation.relationName) {
          const targetRelation = explicitOneRelations.find(r => r.relationName === relation.relationName)
          if (!targetRelation) {
            throw new Error(`Explicit relation not found for ${relation.relationName}`)
          }
          const targetCollection = collectionsByTable.get(targetRelation.referencedTable)
          if (!targetCollection) {
            throw new Error(`Target collection not found for table ${targetRelation.referencedTableName}`)
          }
          collection.relations ??= {}
          collection.relations[key] = {
            to: {
              [targetCollection.name]: {
                on: {
                  [getColumnKey(relation.referencedTable, targetRelation.config!.fields[0]!)]: getColumnKey(relation.sourceTable, targetRelation.config!.references[0]!),
                },
              },
            },
          }
        }
        else {
          // Find the relation in the target collection
          const targetCollection = collectionsByTable.get(relation.referencedTable)
          if (!targetCollection) {
            throw new Error(`Target collection not found for table ${relation.referencedTableName}`)
          }
          if (!targetCollection.relations) {
            throw new Error(`Target collection ${targetCollection.name} has no relations`)
          }
          let newRelation: CollectionRelation | undefined
          for (const relationKey in targetCollection.relations) {
            for (const collectionName in targetCollection.relations[relationKey]!.to) {
              if (collectionName === collection.name) {
                const targetTo = targetCollection.relations[relationKey]!.to[collectionName]!
                const invertedFields = Object.fromEntries(Object.entries(targetTo.on).map(([key, value]) => [value, key]))

                newRelation = {
                  to: {
                    [targetCollection.name]: {
                      on: invertedFields,
                    },
                  },
                }
                break
              }
            }
          }
          if (!newRelation) {
            throw new Error(`Reference relation not found for ${collection.name}.${key}`)
          }
          collection.relations ??= {}
          collection.relations[key] = newRelation
        }
      }

      // Implicit "to many" relations
      for (const { collection, key, relation } of implicitManyRelations) {
        // Explicit relation name
        if (relation.relationName) {
          const targetRelation = explicitOneRelations.find(r => r.relationName === relation.relationName)
          if (!targetRelation) {
            throw new Error(`Explicit relation not found for ${relation.relationName}`)
          }
          const targetCollection = collectionsByTable.get(targetRelation.referencedTable)
          if (!targetCollection) {
            throw new Error(`Target collection not found for table ${targetRelation.referencedTableName}`)
          }
          collection.relations ??= {}
          collection.relations[key] = {
            to: {
              [targetCollection.name]: {
                on: {
                  [getColumnKey(relation.referencedTable, targetRelation.config!.fields[0]!)]: getColumnKey(relation.sourceTable, targetRelation.config!.references[0]!),
                },
              },
            },
            many: true,
          }
        }
        else {
          // Find the relation in the target collection
          const targetCollection = collectionsByTable.get(relation.referencedTable)
          if (!targetCollection) {
            throw new Error(`Target collection not found for table ${relation.referencedTableName}`)
          }
          if (!targetCollection.relations) {
            throw new Error(`Target collection ${targetCollection.name} has no relations`)
          }
          let newRelation: CollectionRelation | undefined
          for (const relationKey in targetCollection.relations) {
            for (const collectionName in targetCollection.relations[relationKey]!.to) {
              if (collectionName === collection.name) {
                const targetTo = targetCollection.relations[relationKey]!.to[collectionName]!
                const invertedFields = Object.fromEntries(Object.entries(targetTo.on).map(([key, value]) => [value, key]))

                newRelation = {
                  to: {
                    [targetCollection.name]: {
                      on: invertedFields,
                    },
                  },
                  many: true,
                }
                break
              }
            }
          }
          if (!newRelation) {
            throw new Error(`Reference relation not found for ${collection.name}.${key}`)
          }
          collection.relations ??= {}
          collection.relations[key] = newRelation
        }
      }

      return collections
    })

    addServerTemplate({
      filename: '$rstore-drizzle-server-utils.js',
      getContents: async () => {
        jiti.cache = {}
        const collections = await getCollectionsFromDrizzleSchema()
        const collectionMetas: Record<string, CustomCollectionMeta | undefined> = {}
        for (const collection of collections) {
          collectionMetas[collection.name] = collection.meta
        }

        return `import * as schema from '${drizzleSchemaPath}'
import { ${options.drizzleImport?.name ?? 'useDrizzle'} as _drizzleDefault } from '${options.drizzleImport?.from ?? '~~/server/utils/drizzle'}'

export const tables = schema
export const collectionMetas = ${JSON.stringify(collectionMetas, null, 2)}
export const dialect = '${drizzleConfig.dialect}'
export const useDrizzles = {
  default: _drizzleDefault,
}`
      },
    })

    addTemplate({
      filename: '$rstore-drizzle-collections.js',
      getContents: async () => {
        const collections = await getCollectionsFromDrizzleSchema()
        return collections.map((collection, index) => {
          let code = `export const collection${index} = {`
          code += `name: '${collection.name}',`
          code += `scopeId: '${collection.scopeId}',`
          code += `meta: ${JSON.stringify(collection.meta)},`
          if (collection.relations) {
            code += `relations: ${JSON.stringify(collection.relations)},`
          }
          code += `getKey: (item) => ${collection.meta?.primaryKeys?.length ? `(${collection.meta.primaryKeys.map(key => `item.${key}`).join(` + '::' + `)})` : 'item.id'},`
          code += `}`
          return code
        }).join('\n')
      },
    })

    addTypeTemplate({
      filename: '$rstore-drizzle-collections.d.ts',
      getContents: async () => {
        const collections = await getCollectionsFromDrizzleSchema()
        return `import { withItemType } from '@rstore/vue'
import * as schema from '${drizzleSchemaPath}'

${collections.map((collection, index) => {
  let code = `export const collection${index} = withItemType<typeof schema.${collection.name}.$inferSelect>().defineCollection({`
  code += `name: '${collection.name}',`
  code += `meta: ${JSON.stringify(collection.meta)},`
  if (collection.relations) {
    code += `relations: ${JSON.stringify(collection.relations)},`
  }
  code += `})`
  return code
}).join('\n')}
`
      },
    })

    // Refresh collections
    if (nuxt.options.dev) {
      nuxt.hook('nitro:init', (nitro) => {
        nitro.hooks.hook('dev:reload', () => {
          updateTemplates({
            filter: template => template.filename === '$rstore-drizzle-collections.js' || template.filename === '$rstore-drizzle-collections.d.ts',
          })
        })
      })
    }

    // Runtime config
    addTemplate({
      filename: '$rstore-drizzle-config.js',
      getContents: () => `export const apiPath = ${JSON.stringify(apiPath)}\n`,
    })

    const { addCollectionImport, addPluginImport } = await import('@rstore/nuxt/api')

    addCollectionImport(nuxt, '#build/$rstore-drizzle-collections.js')

    addPluginImport(nuxt, resolve('./runtime/plugin'))
  },
})
