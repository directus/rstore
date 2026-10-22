import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Locate published client next to emitted entry, with source-checkout fallback. */
export function resolveInspectorAssets(explicit?: string): string {
  const candidates = explicit
    ? [resolve(explicit)]
    : [
        fileURLToPath(new URL('./client/', import.meta.url)),
        fileURLToPath(new URL('../../dist/client/', import.meta.url)),
      ]
  const directory = candidates.find(candidate => existsSync(resolve(candidate, 'index.html')))
  if (!directory)
    throw new Error('rstore inspector assets missing. Run pnpm --filter @rstore/devtools build or set clientDir to built assets.')
  return directory
}

/** Confine SPA fallback; reserved endpoints and missing assets stay 404. */
export async function serveInspectorAssets(req: IncomingMessage, res: ServerResponse, directory: string, relative: string): Promise<void> {
  let path: string
  try {
    path = decodeURIComponent(relative)
  }
  catch {
    res.writeHead(400).end()
    return
  }
  if (path.startsWith('__') || path.split('/').includes('..') || !['GET', 'HEAD'].includes(req.method ?? 'GET')) {
    res.writeHead(404).end()
    return
  }
  const file = resolve(directory, path || 'index.html')
  if (!file.startsWith(`${resolve(directory)}${sep}`)) {
    res.writeHead(404).end()
    return
  }
  const info = await stat(file).catch(() => undefined)
  const spa = !extname(path) && !path.startsWith('assets/')
  if (!info?.isFile() && !spa) {
    res.writeHead(404).end()
    return
  }
  const actual = info?.isFile() ? file : resolve(directory, 'index.html')
  const contentType: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' }
  res.setHeader('Content-Type', contentType[extname(actual)] ?? 'application/octet-stream')
  res.setHeader('Cache-Control', 'no-store')
  res.end(req.method === 'HEAD' ? undefined : await readFile(actual))
}
