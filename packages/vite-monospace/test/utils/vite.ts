import type { Plugin, ResolvedConfig } from 'vite'
import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'

/** Runs the public config hook for focused plugin contracts. */
export function runConfigResolved(plugin: Plugin, root: string): void {
  if (typeof plugin.configResolved !== 'function') {
    throw new TypeError('Expected configResolved hook')
  }
  ;(plugin.configResolved as any)({ root } as ResolvedConfig)
}

/** Runs the public build hook and records actual watched input paths. */
export async function runBuildStart(plugin: Plugin): Promise<string[]> {
  const watched: string[] = []
  if (typeof plugin.buildStart !== 'function') {
    throw new TypeError('Expected buildStart hook')
  }
  await (plugin.buildStart as any).call({ addWatchFile: (file: string) => watched.push(file) }, {})
  return watched
}

/** Resolves and loads generated code through the plugin's public hooks. */
export async function runLoad(plugin: Plugin, id: string): Promise<string> {
  if (typeof plugin.resolveId !== 'function' || typeof plugin.load !== 'function') {
    throw new TypeError('Expected virtual module hooks')
  }
  const resolved = await (plugin.resolveId as any).call({}, id, undefined, {})
  return String(await (plugin.load as any).call({}, resolved, {}))
}

/** Imports generated plain JavaScript so key functions and metadata execute. */
export async function importSchema(plugin: Plugin, id: string): Promise<any[]> {
  const code = await runLoad(plugin, id)
  return (await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default
}

/** Builds and imports an actual browser-targeted ES schema artifact through Vite. */
export async function buildSchema(root: string, plugin: Plugin, id: string): Promise<any[]> {
  const entry = join(root, 'entry.js')
  await writeFile(entry, `export { default } from '${id}'\n`)
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [plugin],
    build: {
      lib: { entry, formats: ['es'], fileName: () => 'schema.mjs' },
    },
  })
  return (await import(/* @vite-ignore */ pathToFileURL(join(root, 'dist/schema.mjs')).href)).default
}
