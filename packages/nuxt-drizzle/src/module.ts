import type { CustomModelMeta, Model, ModelRelation } from '@rstore/shared'
import type { Config as DrizzleKitConfig } from 'drizzle-kit'
import type { getTableConfig as mysqlGetTableConfig } from 'drizzle-orm/mysql-core'
import type { getTableConfig as pgGetTableConfig } from 'drizzle-orm/pg-core'
import type { getTableConfig as singleStoreGetTableConfig } from 'drizzle-orm/singlestore-core'
import type { getTableConfig as sqliteGetTableConfig } from 'drizzle-orm/sqlite-core'
import fs from 'node:fs'
import { addImportsDir, addServerHandler, addServerTemplate, addTemplate, addTypeTemplate, createResolver, defineNuxtModule, hasNuxtModule, installModule, updateTemplates, useLogger } from '@nuxt/kit'
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

    /**
     * @deprecated
     */
    default: { name: string, from: string }
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
  },
  defaults: {},
  async setup(options, nuxt) {
    const log = useLogger('rstore-drizzle')
    const { resolve } = createResolver(import.meta.url)

    if (!hasNuxtModule('@rstore/nuxt')) {
      await installModule('@rstore/nuxt')
    }

    // Add global types
    nuxt.hook('prepare:types', ({ references }) => {
      references.push({ path: resolve('./runtime/types.ts') })
    })

    const apiPath = options.apiPath ?? '/api/rstore'

    // Add files to nuxt app
    addServerHandler({
      handler: resolve('./runtime/server/api/index.get'),
      route: `${apiPath}/:model`,
      method: 'get',
    })
    addServerHandler({
      handler: resolve('./runtime/server/api/index.post'),
      route: `${apiPath}/:model`,
      method: 'post',
    })
    addServerHandler({
      handler: resolve('./runtime/server/api/[key]/index.get'),
      route: `${apiPath}/:model/:key`,
      method: 'get',
    })
    addServerHandler({
      handler: resolve('./runtime/server/api/[key]/index.patch'),
      route: `${apiPath}/:model/:key`,
      method: 'patch',
    })
    addServerHandler({
      handler: resolve('./runtime/server/api/[key]/index.delete'),
      route: `${apiPath}/:model/:key`,
      method: 'delete',
    })
    addImportsDir(resolve('./runtime/utils'))

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

    const getModelsFromDrizzleSchema = useDedupePromise(async () => {
      const schema = { ...(await jiti.import(drizzleSchemaPath)) as any }

      const models: Model[] = []
      const modelsByTable = new WeakMap<Table, Model>()

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
        const model: Model = {
          '~type': 'model',
          'name': key,
          'scopeId': 'rstore-drizzle',
          'meta': {
            table: tableName,
            primaryKeys: config?.primaryKeys?.length ? config.primaryKeys[0]!.columns.map(col => getColumnKey(table, col)) : config?.columns?.filter(col => col.primary).map(col => getColumnKey(table, col)) ?? [],
          },
        }
        models.push(model)
        modelsByTable.set(table, model)
      }

      const explicitOneRelations: Array<One> = []
      const implicitOneRelations: Array<{ model: Model, key: string, relation: One }> = []
      const implicitManyRelations: Array<{ model: Model, key: string, relation: Many<string> }> = []

      for (const relations of relationsList) {
        const model = modelsByTable.get(relations.table)
        if (!model) {
          throw new Error(`Model not found for table ${relations.table}`)
        }

        const config = relations.config(createTableRelationsHelpers(relations.table))

        // Explicit "to one" relations
        for (const key in config) {
          const relation = config[key]
          if (is(relation, One)) {
            if (relation.config) {
              const fields = relation.config.fields
              if (!fields[0]) {
                implicitOneRelations.push({ model, key, relation })
                continue
              }
              if (fields.length > 1) {
                throw new Error(`Relations with multiple fields are not supported yet, see https://github.com/Akryum/rstore/issues/7`)
              }
              const references = relation.config.references
              if (!references[0]) {
                implicitOneRelations.push({ model, key, relation })
                continue
              }
              if (references.length > 1) {
                throw new Error(`Relations with multiple references are not supported yet, see https://github.com/Akryum/rstore/issues/7`)
              }

              const targetModel = modelsByTable.get(relation.referencedTable)
              if (!targetModel) {
                throw new Error(`Target model not found for table ${relation.referencedTableName}`)
              }

              model.relations ??= {}
              model.relations[key] = {
                to: {
                  [targetModel.name]: {
                    on: {
                      [getColumnKey(relation.referencedTable, references[0])]: getColumnKey(relation.sourceTable, fields[0]),
                    },
                  },
                },
              }
              explicitOneRelations.push(relation)
            }
            else {
              implicitOneRelations.push({ model, key, relation })
            }
          }
          else if (is(relation, Many)) {
            implicitManyRelations.push({ model, key, relation })
          }
        }
      }

      // Implicit "to one" relations
      for (const { model, key, relation } of implicitOneRelations) {
        // Explicit relation name
        if (relation.relationName) {
          const targetRelation = explicitOneRelations.find(r => r.relationName === relation.relationName)
          if (!targetRelation) {
            throw new Error(`Explicit relation not found for ${relation.relationName}`)
          }
          const targetModel = modelsByTable.get(targetRelation.referencedTable)
          if (!targetModel) {
            throw new Error(`Target model not found for table ${targetRelation.referencedTableName}`)
          }
          model.relations ??= {}
          model.relations[key] = {
            to: {
              [targetModel.name]: {
                on: {
                  [getColumnKey(relation.referencedTable, targetRelation.config!.fields[0])]: getColumnKey(relation.sourceTable, targetRelation.config!.references[0]),
                },
              },
            },
          }
        }
        else {
          // Find the relation in the target model
          const targetModel = modelsByTable.get(relation.referencedTable)
          if (!targetModel) {
            throw new Error(`Target model not found for table ${relation.referencedTableName}`)
          }
          if (!targetModel.relations) {
            throw new Error(`Target model ${targetModel.name} has no relations`)
          }
          let newRelation: ModelRelation | undefined
          for (const relationKey in targetModel.relations) {
            for (const modelName in targetModel.relations[relationKey]!.to) {
              if (modelName === model.name) {
                const targetTo = targetModel.relations[relationKey]!.to[modelName]!
                const invertedFields = Object.fromEntries(Object.entries(targetTo.on).map(([key, value]) => [value, key]))

                newRelation = {
                  to: {
                    [targetModel.name]: {
                      on: invertedFields,
                    },
                  },
                }
                break
              }
            }
          }
          if (!newRelation) {
            throw new Error(`Reference relation not found for ${model.name}.${key}`)
          }
          model.relations ??= {}
          model.relations[key] = newRelation
        }
      }

      // Implicit "to many" relations
      for (const { model, key, relation } of implicitManyRelations) {
        // Explicit relation name
        if (relation.relationName) {
          const targetRelation = explicitOneRelations.find(r => r.relationName === relation.relationName)
          if (!targetRelation) {
            throw new Error(`Explicit relation not found for ${relation.relationName}`)
          }
          const targetModel = modelsByTable.get(targetRelation.referencedTable)
          if (!targetModel) {
            throw new Error(`Target model not found for table ${targetRelation.referencedTableName}`)
          }
          model.relations ??= {}
          model.relations[key] = {
            to: {
              [targetModel.name]: {
                on: {
                  [getColumnKey(relation.referencedTable, targetRelation.config!.fields[0])]: getColumnKey(relation.sourceTable, targetRelation.config!.references[0]),
                },
              },
            },
            many: true,
          }
        }
        else {
          // Find the relation in the target model
          const targetModel = modelsByTable.get(relation.referencedTable)
          if (!targetModel) {
            throw new Error(`Target model not found for table ${relation.referencedTableName}`)
          }
          if (!targetModel.relations) {
            throw new Error(`Target model ${targetModel.name} has no relations`)
          }
          let newRelation: ModelRelation | undefined
          for (const relationKey in targetModel.relations) {
            for (const modelName in targetModel.relations[relationKey]!.to) {
              if (modelName === model.name) {
                const targetTo = targetModel.relations[relationKey]!.to[modelName]!
                const invertedFields = Object.fromEntries(Object.entries(targetTo.on).map(([key, value]) => [value, key]))

                newRelation = {
                  to: {
                    [targetModel.name]: {
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
            throw new Error(`Reference relation not found for ${model.name}.${key}`)
          }
          model.relations ??= {}
          model.relations[key] = newRelation
        }
      }

      return models
    })

    addServerTemplate({
      filename: '$rstore-drizzle-server-utils.js',
      getContents: async () => {
        jiti.cache = {}
        const models = await getModelsFromDrizzleSchema()
        const modelMetas: Record<string, CustomModelMeta | undefined> = {}
        for (const model of models) {
          modelMetas[model.name] = model.meta
        }

        return `import * as schema from '${drizzleSchemaPath}'
import { ${options.drizzleImport?.name ?? options.drizzleImport?.default?.name ?? 'useDrizzle'} as _drizzleDefault } from '${options.drizzleImport?.from ?? options.drizzleImport?.default?.from ?? '~~/server/utils/drizzle'}'

export const tables = schema
export const modelMetas = ${JSON.stringify(modelMetas, null, 2)}
export const dialect = '${drizzleConfig.dialect}'
export const useDrizzles = {
  default: _drizzleDefault,
}`
      },
    })

    addTemplate({
      filename: '$rstore-drizzle-models.js',
      getContents: async () => {
        const models = await getModelsFromDrizzleSchema()
        return `export default [${
          models.map((model) => {
            let code = `{`
            code += `name: '${model.name}',`
            code += `scopeId: '${model.scopeId}',`
            code += `meta: ${JSON.stringify(model.meta)},`
            if (model.relations) {
              code += `relations: ${JSON.stringify(model.relations)},`
            }
            code += `getKey: (item) => ${model.meta?.primaryKeys?.length ? `(${model.meta.primaryKeys.map(key => `item.${key}`).join(' + ')})` : 'item.id'},`
            code += `}`
            return code
          }).join(',\n')
        }]`
      },
    })

    addTypeTemplate({
      filename: '$rstore-drizzle-models.d.ts',
      getContents: async () => {
        const models = await getModelsFromDrizzleSchema()
        return `import { defineItemType } from '@rstore/vue'
import * as schema from '${drizzleSchemaPath}'

export default [
  ${models.map((model) => {
    let code = `defineItemType<typeof schema.${model.name}.$inferSelect>().model({`
    code += `name: '${model.name}',`
    code += `meta: ${JSON.stringify(model.meta)},`
    if (model.relations) {
      code += `relations: ${JSON.stringify(model.relations)},`
    }
    code += `}),`
    return code
  }).join('\n')}
]
`
      },
    })

    // Refresh models
    if (nuxt.options.dev) {
      nuxt.hook('nitro:init', (nitro) => {
        nitro.hooks.hook('dev:reload', () => {
          updateTemplates({
            filter: template => template.filename === '$rstore-drizzle-models.js' || template.filename === '$rstore-drizzle-models.d.ts',
          })
        })
      })
    }

    // Runtime config
    addTemplate({
      filename: '$rstore-drizzle-config.js',
      getContents: () => `export const apiPath = ${JSON.stringify(apiPath)}\n`,
    })

    const { addModelImport, addPluginImport } = await import('@rstore/nuxt/api')

    addModelImport(nuxt, '#build/$rstore-drizzle-models.js')

    addPluginImport(nuxt, resolve('./runtime/plugin'))
  },
})
