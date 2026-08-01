import type { Plugin, ResolvedConfig } from 'vite'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRstoreVirtualModulePlugin } from '../src/vite'

interface TestCollection {
  name: string
}

const VIRTUAL_IDS = {
  index: 'virtual:rstore-test',
  schema: 'virtual:rstore-test/schema',
  plugin: 'virtual:rstore-test/plugin',
}

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, {
    force: true,
    recursive: true,
  })))
})

describe('createRstoreVirtualModulePlugin', () => {
  it('resolves and loads the three virtual modules', async () => {
    const { plugin } = await createTestPlugin()

    expect(await runLoad(plugin, VIRTUAL_IDS.index)).toBe('// index [todos]')
    expect(await runLoad(plugin, VIRTUAL_IDS.schema)).toBe('// schema [todos]')
    expect(await runLoad(plugin, VIRTUAL_IDS.plugin)).toBe('// plugin [todos]')
  })

  it('ignores non-virtual module ids', async () => {
    const { plugin } = await createTestPlugin()

    expect(runHook(plugin.resolveId, 'src/main.ts')).toBeUndefined()
    expect(await runHook(plugin.load, 'src/main.ts')).toBeUndefined()
  })

  it('loads collections once across buildStart and loads', async () => {
    const { plugin, loadCollections } = await createTestPlugin()

    await runBuildStart(plugin)
    await runLoad(plugin, VIRTUAL_IDS.index)
    await runLoad(plugin, VIRTUAL_IDS.schema)

    expect(loadCollections).toHaveBeenCalledTimes(1)
    expect(loadCollections).toHaveBeenCalledWith({ config: expect.objectContaining({ root: expect.any(String) }) })
  })

  it('writes the declaration file next to the vite root', async () => {
    const { plugin, root } = await createTestPlugin()

    await runBuildStart(plugin)

    const declarations = await readFile(join(root, 'rstore-test.d.ts'), 'utf8')
    expect(declarations).toBe('// declarations [todos]')
  })

  it('honours a custom dts path and dts: false', async () => {
    const { plugin, root } = await createTestPlugin({ dts: 'types/custom.d.ts' })
    await runBuildStart(plugin)
    expect(await readFile(join(root, 'types/custom.d.ts'), 'utf8')).toBe('// declarations [todos]')

    const disabled = await createTestPlugin({ dts: false })
    await runBuildStart(disabled.plugin)
    await expect(access(join(disabled.root, 'rstore-test.d.ts'))).rejects.toThrow()
  })

  it('registers watch files and resets the memo on watchChange', async () => {
    const watchFile = '/tmp/schema.json'
    const { plugin, loadCollections } = await createTestPlugin({
      resolveWatchFiles: () => [watchFile],
    })

    const addWatchFile = vi.fn()
    await runBuildStart(plugin, { addWatchFile })
    expect(addWatchFile).toHaveBeenCalledWith(watchFile)
    expect(loadCollections).toHaveBeenCalledTimes(1)

    runHook(plugin.watchChange, watchFile, { event: 'update' })
    await runLoad(plugin, VIRTUAL_IDS.schema)
    expect(loadCollections).toHaveBeenCalledTimes(2)
  })

  it('invalidates virtual modules when the dev server sees watch file changes', async () => {
    const watchFile = '/tmp/schema.json'
    const { plugin, loadCollections } = await createTestPlugin({
      resolveWatchFiles: () => [watchFile],
    })
    await runBuildStart(plugin)

    const changeListeners: Array<(file: string) => void> = []
    const invalidateModule = vi.fn()
    const send = vi.fn()
    const server = {
      moduleGraph: {
        getModuleById: vi.fn((id: string) => id.includes('schema') ? { id } : undefined),
        invalidateModule,
      },
      watcher: {
        add: vi.fn(),
        on: vi.fn((event: string, listener: (file: string) => void) => {
          if (event === 'change') {
            changeListeners.push(listener)
          }
        }),
      },
      ws: { send },
    }

    runHook(plugin.configureServer, server)

    expect(server.watcher.add).toHaveBeenCalledWith(watchFile)
    changeListeners.forEach(listener => listener(watchFile))

    expect(invalidateModule).toHaveBeenCalledWith({ id: `\0${VIRTUAL_IDS.schema}` })
    expect(send).toHaveBeenCalledWith({ type: 'full-reload' })
    await runLoad(plugin, VIRTUAL_IDS.schema)
    expect(loadCollections).toHaveBeenCalledTimes(2)
  })

  it('skips the dev server watcher without watch files', async () => {
    const { plugin } = await createTestPlugin()
    const server = {
      watcher: {
        add: vi.fn(),
        on: vi.fn(),
      },
    }

    runHook(plugin.configureServer, server)

    expect(server.watcher.add).not.toHaveBeenCalled()
    expect(server.watcher.on).not.toHaveBeenCalled()
  })
})

/**
 * Creates a plugin instance with stub codegen callbacks and a temp root.
 */
async function createTestPlugin(overrides: Record<string, any> = {}): Promise<{
  plugin: Plugin
  root: string
  loadCollections: ReturnType<typeof vi.fn>
}> {
  const root = await mkdtemp(join(tmpdir(), 'rstore-connector-toolkit-'))
  tempDirs.push(root)

  const loadCollections = vi.fn(async (): Promise<TestCollection[]> => [{ name: 'todos' }])
  const render = (kind: string) => (collections: TestCollection[]): string => {
    return `// ${kind} [${collections.map(collection => collection.name).join(', ')}]`
  }

  const plugin = createRstoreVirtualModulePlugin<TestCollection>({
    name: 'rstore-vite-test',
    virtualIds: VIRTUAL_IDS,
    loadCollections,
    generateIndex: render('index'),
    generateSchema: render('schema'),
    generatePlugin: render('plugin'),
    generateDeclarations: render('declarations'),
    defaultDtsFileName: 'rstore-test.d.ts',
    ...overrides,
  })

  runHook(plugin.configResolved, { root } as ResolvedConfig)

  return { plugin, root, loadCollections }
}

/**
 * Runs a Vite plugin hook (object or function form) with a bare context.
 */
function runHook(hook: any, ...args: any[]): any {
  const handler = typeof hook === 'function' ? hook : hook?.handler
  if (typeof handler === 'function') {
    return handler.call({}, ...args)
  }
}

/**
 * Runs the buildStart hook with an optional plugin context.
 */
async function runBuildStart(plugin: Plugin, context: Record<string, any> = { addWatchFile: vi.fn() }): Promise<void> {
  const handler = typeof plugin.buildStart === 'function' ? plugin.buildStart : plugin.buildStart?.handler
  if (typeof handler === 'function') {
    await (handler as any).call(context, {} as any)
  }
}

/**
 * Resolves and loads one virtual module from the plugin.
 */
async function runLoad(plugin: Plugin, id: string): Promise<string | undefined> {
  const resolved = runHook(plugin.resolveId, id, undefined, {})
  const code = await runHook(plugin.load, String(resolved ?? id), {})
  return code == null ? undefined : String(code)
}
