import type { CustomModelMeta, Model, ModelRelation } from '@rstore/shared'
import type { Config as DrizzleKitConfig } from 'drizzle-kit'
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
}

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

    // Add files to nuxt app
    addServerHandler({
      handler: resolve('./runtime/server/api/index.get'),
      route: '/api/rstore/:model',
      method: 'get',
    })
    addServerHandler({
      handler: resolve('./runtime/server/api/index.post'),
      route: '/api/rstore/:model',
      method: 'post',
    })
    addServerHandler({
      handler: resolve('./runtime/server/api/[key]/index.get'),
      route: '/api/rstore/:model/:key',
      method: 'get',
    })
    addServerHandler({
      handler: resolve('./runtime/server/api/[key]/index.patch'),
      route: '/api/rstore/:model/:key',
      method: 'patch',
    })
    addServerHandler({
      handler: resolve('./runtime/server/api/[key]/index.delete'),
      route: '/api/rstore/:model/:key',
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

    const getModelsFormDrizzleSchema = useDedupePromise(async () => {
      const schema = { ...(await jiti.import(drizzleSchemaPath)) as any }

      const models: Model[] = []
      const modelsByTable = new WeakMap<Table, Model>()

      const tables: Array<{ key: string, table: Table, tableName: string, config: TableConfig | undefined }> = []
      const relationsList: Array<Relations> = []

      for (const key in schema) {
        const schemaItem = schema[key]
        if (isTable(schemaItem)) {
          let config: TableConfig | undefined

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

      for (const { key, table, tableName, config } of tables) {
        const model: Model = {
          name: key,
          meta: {
            scopeId: 'rstore-drizzle',
            table: tableName,
            primaryKeys: (config as any)?.primaryKeys?.length ? (config as any).primaryKeys : (config?.columns as any[] | undefined)?.filter(col => col.primary).map(col => col.keyAsName ? col.name : col.key),
          },
        }
        models.push(model)
        modelsByTable.set(table, model)
      }

      for (const relations of relationsList) {
        const model = modelsByTable.get(relations.table)
        if (!model) {
          throw new Error(`Model not found for table ${relations.table}`)
        }
        model.relations ??= {}

        const config = relations.config(createTableRelationsHelpers(relations.table))

        const explicitOneRelations: One[] = []
        const implicitOneRelations: Array<{ key: string, relation: One }> = []
        const implicitManyRelations: Array<{ key: string, relation: Many<string> }> = []

        for (const key in config) {
          const relation = config[key]
          if (is(relation, One)) {
            if (relation.config) {
              const fields = relation.config.fields
              if (!fields[0]) {
                implicitOneRelations.push({ key, relation })
                continue
              }
              if (fields.length > 1) {
                throw new Error(`Relations with multiple fields are not supported yet, see https://github.com/Akryum/rstore/issues/7`)
              }
              const references = relation.config.references
              if (!references[0]) {
                implicitOneRelations.push({ key, relation })
                continue
              }
              if (references.length > 1) {
                throw new Error(`Relations with multiple references are not supported yet, see https://github.com/Akryum/rstore/issues/7`)
              }

              const targetModel = modelsByTable.get(relation.referencedTable)
              if (!targetModel) {
                throw new Error(`Target model not found for table ${relation.referencedTableName}`)
              }

              model.relations[key] = {
                to: {
                  [targetModel.name]: {
                    on: references[0].name,
                    eq: fields[0].name,
                  },
                },
              }
              explicitOneRelations.push(relation)
            }
            else {
              implicitOneRelations.push({ key, relation })
            }
          }
          else if (is(relation, Many)) {
            implicitManyRelations.push({ key, relation })
          }
        }

        for (const { key, relation } of implicitOneRelations) {
          if (relation.relationName) {
            const targetRelation = explicitOneRelations.find(r => r.relationName === relation.relationName)
            if (!targetRelation) {
              throw new Error(`Explicit relation not found for ${relation.relationName}`)
            }
            const targetModel = modelsByTable.get(targetRelation.referencedTable)
            if (!targetModel) {
              throw new Error(`Target model not found for table ${targetRelation.referencedTableName}`)
            }
            model.relations[key] = {
              to: {
                [targetModel.name]: {
                  on: targetRelation.config!.fields[0]!.name,
                  eq: targetRelation.config!.references[0]!.name,
                },
              },
            }
          }
          else {
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
                  newRelation = {
                    to: {
                      [targetModel.name]: {
                        on: targetModel.relations[relationKey]!.to[modelName]!.eq,
                        eq: targetModel.relations[relationKey]!.to[modelName]!.on,
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
            model.relations[key] = newRelation
          }
        }

        for (const { key, relation } of implicitManyRelations) {
          if (relation.relationName) {
            const targetRelation = explicitOneRelations.find(r => r.relationName === relation.relationName)
            if (!targetRelation) {
              throw new Error(`Explicit relation not found for ${relation.relationName}`)
            }
            const targetModel = modelsByTable.get(targetRelation.referencedTable)
            if (!targetModel) {
              throw new Error(`Target model not found for table ${targetRelation.referencedTableName}`)
            }
            model.relations[key] = {
              to: {
                [targetModel.name]: {
                  on: targetRelation.config!.fields[0]!.name,
                  eq: targetRelation.config!.references[0]!.name,
                },
              },
              many: true,
            }
          }
          else {
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
                  newRelation = {
                    to: {
                      [targetModel.name]: {
                        on: targetModel.relations[relationKey]!.to[modelName]!.eq,
                        eq: targetModel.relations[relationKey]!.to[modelName]!.on,
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
            model.relations[key] = newRelation
          }
        }
      }

      return models
    })

    addServerTemplate({
      filename: '$rstore-drizzle-server-utils.js',
      getContents: async () => {
        jiti.cache = {}
        const models = await getModelsFormDrizzleSchema()
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
        const models = await getModelsFormDrizzleSchema()
        return `export default [${
          models.map((model) => {
            let code = `{`
            code += `name: '${model.name}',`
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
        const models = await getModelsFormDrizzleSchema()
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
    code += `} as const),`
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

    // Add global types
    nuxt.hook('prepare:types', ({ references }) => {
      references.push({ path: resolve('./runtime/types.ts') })
    })

    const { addModelImport, addPluginImport } = await import('@rstore/nuxt/api')

    addModelImport(nuxt, '#build/$rstore-drizzle-models.js')

    addPluginImport(nuxt, resolve('./runtime/plugin'))
  },
})
