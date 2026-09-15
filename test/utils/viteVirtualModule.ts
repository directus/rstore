import type { Plugin, ResolvedConfig } from 'vite'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Temporary Vite roots allocated by one test module. */
export interface ViteTempRoots {
  /** Creates and tracks one temporary Vite root. */
  create: (prefix: string) => Promise<string>
  /** Removes all tracked roots after a test. */
  cleanup: () => Promise<void>
}

/**
 * Tracks temporary Vite roots so adapter build tests have identical cleanup.
 */
export function createViteTempRoots(): ViteTempRoots {
  const roots: string[] = []

  return {
    async create(prefix) {
      const root = await mkdtemp(join(tmpdir(), prefix))
      roots.push(root)
      return root
    },
    async cleanup() {
      await Promise.all(roots.splice(0).map(root => rm(root, {
        force: true,
        recursive: true,
      })))
    },
  }
}

/** Runs a Vite plugin hook in function or object-hook form. */
export function runViteHook(hook: unknown, ...args: any[]): any {
  const handler = typeof hook === 'function' ? hook : (hook as { handler?: unknown } | undefined)?.handler
  if (typeof handler === 'function') {
    return handler.call({}, ...args)
  }
}

/** Supplies the minimal resolved Vite config used by virtual-module tests. */
export function resolveViteConfig(plugin: Plugin, root: string): void {
  runViteHook(plugin.configResolved, { root } as ResolvedConfig)
}

/** Runs Vite's buildStart hook with an optional test plugin context. */
export async function runViteBuildStart(plugin: Plugin, context: Record<string, any> = { addWatchFile: () => {} }): Promise<void> {
  const hook = plugin.buildStart
  const handler = typeof hook === 'function' ? hook : hook?.handler
  if (typeof handler === 'function') {
    await handler.call(context as any, {} as any)
  }
}

/** Resolves a public virtual ID to Vite's internal, NUL-prefixed module ID. */
export function resolveViteVirtualModule(plugin: Plugin, id: string): string | undefined {
  const resolved = runViteHook(plugin.resolveId, id, undefined, {})
  return resolved == null ? undefined : String(resolved)
}

/** Loads generated code for one public virtual module ID. */
export async function loadViteVirtualModule(plugin: Plugin, id: string): Promise<string> {
  const resolved = resolveViteVirtualModule(plugin, id)
  const code = await runViteHook(plugin.load, resolved ?? id, {})
  return String(code ?? '')
}

/** Writes a minimal Vite entry that imports one generated virtual module. */
export async function writeViteVirtualModuleEntry(root: string, virtualModuleId: string): Promise<void> {
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'index.html'), '<script type="module" src="/src/main.ts"></script>')
  await writeFile(join(root, 'src/main.ts'), `import schema from '${virtualModuleId}'

console.log(schema.length)
`)
}
