import type { Config as DrizzleKitConfig } from 'drizzle-kit'
import type { ModuleOptions } from './types'
import fs from 'node:fs'
import { createResolver, defineNuxtModule, useLogger } from '@nuxt/kit'
import { createJiti } from 'jiti'
import path from 'pathe'
import { registerRuntimeConfigTemplate } from './config'
import { setupOffline } from './offline'
import { setupRealtime } from './realtime'
import { registerApiRoutes, registerRuntimeImports } from './routes'
import { createCollectionsLoader } from './schema'
import { registerDrizzleTemplates, registerRstoreNuxtImports } from './templates'

export type * from '../runtime/types'
export type { ModuleOptions } from './types'

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
    const resolveRuntime = (id: string) => id.startsWith('./runtime') ? resolve(`..${id.slice(1)}`) : resolve(id)

    nuxt.hook('prepare:types', ({ references }) => {
      references.push({ path: resolve('../runtime/types.ts') })
    })

    const drizzleConfigPath = options.drizzleConfigPath ?? 'drizzle.config.ts'
    const drizzleConfigFullPath = path.resolve(nuxt.options.rootDir, drizzleConfigPath)
    if (!fs.existsSync(drizzleConfigFullPath)) {
      log.warn(`Drizzle config not found, skipping drizzle module (looking for ${drizzleConfigPath})`)
      return
    }

    const jiti = createJiti(import.meta.url, {
      moduleCache: false,
    })
    const drizzleConfig = (await jiti.import(drizzleConfigFullPath) as { default: DrizzleKitConfig }).default
    if (!drizzleConfig) {
      throw new Error('No drizzle config found')
    }
    if (typeof drizzleConfig.schema !== 'string') {
      throw new TypeError('Drizzle schema must be a single file path')
    }

    const apiPath = options.apiPath ?? '/api/rstore'
    const scopeId = options.scopeId ?? 'rstore-drizzle'
    const drizzleSchemaPath = path.resolve(nuxt.options.rootDir, drizzleConfig.schema)
    const getCollections = createCollectionsLoader({
      jiti,
      drizzleSchemaPath,
      drizzleConfig,
      scopeId,
    })

    registerApiRoutes(resolveRuntime, apiPath)
    registerRuntimeImports(resolveRuntime)
    registerDrizzleTemplates({
      nuxt,
      drizzleSchemaPath,
      drizzleConfig,
      drizzleImport: options.drizzleImport,
      getCollections,
    })
    const { addPluginImport } = await registerRstoreNuxtImports(nuxt, resolveRuntime)
    const realtime = setupRealtime({ options, nuxt, resolve: resolveRuntime, addPluginImport })
    const offlineOptions = setupOffline({ options, nuxt, resolve: resolveRuntime, addPluginImport })
    registerRuntimeConfigTemplate({
      apiPath,
      realtime,
      scopeId,
      drizzleConfig,
      offlineOptions,
    })
  },
})
