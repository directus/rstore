import type { Plugin, ResolvedConfig } from 'vite'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import process from 'node:process'

const RESOLVED_PREFIX = '\0'

/**
 * Public virtual module ids exposed by a connector Vite plugin.
 */
export interface VirtualModuleIds {
  /**
   * Base module re-exporting schema and plugin (for example
   * `virtual:rstore-directus`).
   */
  index: string

  /**
   * Schema module id (for example `virtual:rstore-directus/schema`).
   */
  schema: string

  /**
   * Plugin module id (for example `virtual:rstore-directus/plugin`).
   */
  plugin: string
}

/**
 * Context passed to collection loading and watch-file hooks.
 */
export interface VirtualModulePluginContext {
  /**
   * Resolved Vite config, when `configResolved` already ran.
   */
  config: ResolvedConfig | undefined
}

/**
 * Options accepted by {@link createRstoreVirtualModulePlugin}.
 */
export interface RstoreVirtualModulePluginOptions<TCollection> {
  /**
   * Vite plugin name (for example `rstore-vite-directus`).
   */
  name: string

  /**
   * Public virtual module ids served by the plugin.
   */
  virtualIds: VirtualModuleIds

  /**
   * Loads the generated collections (memoized per plugin instance).
   */
  loadCollections: (ctx: VirtualModulePluginContext) => Promise<TCollection[]>

  /**
   * Generates the index virtual module source.
   */
  generateIndex: (collections: TCollection[]) => string

  /**
   * Generates the schema virtual module source.
   */
  generateSchema: (collections: TCollection[]) => string

  /**
   * Generates the plugin virtual module source.
   */
  generatePlugin: (collections: TCollection[]) => string

  /**
   * Generates the `.d.ts` declaration file content.
   */
  generateDeclarations: (collections: TCollection[]) => string

  /**
   * Type declaration file path. Set to `false` to disable generation.
   */
  dts?: string | boolean

  /**
   * Declaration file name used when `dts` is omitted or `true`.
   */
  defaultDtsFileName: string

  /**
   * Returns local files whose changes invalidate the loaded collections.
   */
  resolveWatchFiles?: (ctx: VirtualModulePluginContext) => string[]
}

/**
 * Creates a Vite plugin serving generated rstore connector virtual modules.
 *
 * The factory owns virtual id resolution, memoized collection loading,
 * declaration file output, and local schema file watching; connectors only
 * provide the codegen callbacks.
 */
export function createRstoreVirtualModulePlugin<TCollection>(
  options: RstoreVirtualModulePluginOptions<TCollection>,
): Plugin {
  let config: ResolvedConfig | undefined
  let collectionsPromise: Promise<TCollection[]> | undefined

  const publicIds = [options.virtualIds.index, options.virtualIds.schema, options.virtualIds.plugin]

  return {
    name: options.name,

    configResolved(resolvedConfig) {
      config = resolvedConfig
    },

    configureServer(server) {
      const watchFiles = resolveWatchFiles()
      if (!watchFiles.length) {
        return
      }

      // Regenerate the virtual modules when a local schema file changes.
      for (const file of watchFiles) {
        server.watcher.add(file)
      }
      server.watcher.on('change', (file) => {
        if (!watchFiles.includes(file)) {
          return
        }

        collectionsPromise = undefined
        for (const id of publicIds) {
          const module = server.moduleGraph.getModuleById(`${RESOLVED_PREFIX}${id}`)
          if (module) {
            server.moduleGraph.invalidateModule(module)
          }
        }
        server.ws.send({ type: 'full-reload' })
      })
    },

    resolveId(id) {
      if (isVirtualModuleId(id)) {
        return `${RESOLVED_PREFIX}${id}`
      }
    },

    async buildStart() {
      for (const file of resolveWatchFiles()) {
        this.addWatchFile(file)
      }
      await getCollections()
    },

    watchChange(id) {
      // Reload the local schema files on the next rebuild in watch mode.
      if (resolveWatchFiles().includes(id)) {
        collectionsPromise = undefined
      }
    },

    async load(id) {
      const virtualId = unwrapVirtualModuleId(id)
      if (!virtualId) {
        return
      }

      const collections = await getCollections()

      switch (virtualId) {
        case options.virtualIds.index:
          return options.generateIndex(collections)
        case options.virtualIds.schema:
          return options.generateSchema(collections)
        case options.virtualIds.plugin:
          return options.generatePlugin(collections)
      }
    },
  }

  /**
   * Loads collections once per plugin instance.
   */
  async function getCollections(): Promise<TCollection[]> {
    collectionsPromise ??= options.loadCollections({ config }).then(async (collections) => {
      await writeDeclarationFile(collections)
      return collections
    })
    return collectionsPromise
  }

  /**
   * Resolves the configured local watch file paths.
   */
  function resolveWatchFiles(): string[] {
    return options.resolveWatchFiles?.({ config }) ?? []
  }

  /**
   * Writes generated virtual-module declarations when enabled.
   */
  async function writeDeclarationFile(collections: TCollection[]): Promise<void> {
    if (options.dts === false) {
      return
    }

    const dtsPath = resolveDeclarationPath()
    await mkdir(dirname(dtsPath), { recursive: true })
    await writeFile(dtsPath, options.generateDeclarations(collections))
  }

  /**
   * Resolves the declaration file output path.
   */
  function resolveDeclarationPath(): string {
    const root = config?.root ?? process.cwd()
    const path = typeof options.dts === 'string' ? options.dts : options.defaultDtsFileName
    return isAbsolute(path) ? path : resolve(root, path)
  }

  /**
   * Returns whether an id is one of the public virtual modules.
   */
  function isVirtualModuleId(id: string): boolean {
    return publicIds.includes(id)
  }

  /**
   * Converts a resolved virtual id back to its public module id.
   */
  function unwrapVirtualModuleId(id: string): string | null {
    const virtualId = id.startsWith(RESOLVED_PREFIX) ? id.slice(RESOLVED_PREFIX.length) : id
    return isVirtualModuleId(virtualId) ? virtualId : null
  }
}
