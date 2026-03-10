import { readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sirv from 'sirv'

const DEFAULT_ROUTE = '/__rstore'
const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/client')

function normalizeRoute(route = DEFAULT_ROUTE) {
  const normalized = route.startsWith('/') ? route : `/${route}`
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

async function listClientFiles(rootDir: string, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const entryPath = resolve(currentDir, entry.name)

    if (entry.isDirectory())
      files.push(...await listClientFiles(rootDir, entryPath))
    else
      files.push(entryPath.slice(rootDir.length + 1).replaceAll('\\', '/'))
  }

  return files
}

export function rstoreDevtools(options: { route?: string } = {}) {
  const route = normalizeRoute(options.route)

  return {
    name: 'rstore-devtools',
    apply: 'serve',
    configureServer(server: { middlewares: { use: (path: string, handler: any) => void } }) {
      server.middlewares.use(route, sirv(clientDir, { dev: true, single: true }))
    },
    configurePreviewServer(server: { middlewares: { use: (path: string, handler: any) => void } }) {
      server.middlewares.use(route, sirv(clientDir, { dev: false, single: true }))
    },
  }
}

export function rstoreDevtoolsBuild(options: { route?: string } = {}) {
  const route = normalizeRoute(options.route)
  const routeDir = route.slice(1)

  return {
    name: 'rstore-devtools-build',
    apply: 'build',
    async generateBundle(this: { emitFile: (file: { type: 'asset', fileName: string, source: string | Uint8Array }) => void }) {
      const files = await listClientFiles(clientDir)

      for (const file of files) {
        const source = await readFile(resolve(clientDir, file))
        this.emitFile({
          type: 'asset',
          fileName: `${routeDir}/${file}`,
          source,
        })
      }
    },
  }
}

export function rstoreDevtoolsVite(options: { route?: string } = {}) {
  return [
    rstoreDevtools(options),
    rstoreDevtoolsBuild(options),
  ]
}
