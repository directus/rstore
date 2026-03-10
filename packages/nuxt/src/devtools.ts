import type { Resolver } from '@nuxt/kit'
import type { Nuxt } from 'nuxt/schema'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const DEVTOOLS_UI_ROUTE = '/__rstore'
const DEVTOOLS_UI_IFRAME_SRC = `${DEVTOOLS_UI_ROUTE}/`
const DEVTOOLS_UI_LOCAL_PORT = 3300
const devtoolsRequire = createRequire(import.meta.url)

function resolveDevtoolsClientPath() {
  try {
    const entryPath = devtoolsRequire.resolve('@rstore/devtools')
    return resolve(dirname(entryPath), 'client')
  }
  catch {
    return null
  }
}

export function setupDevToolsUI(nuxt: Nuxt, _resolver: Resolver) {
  const clientPath = resolveDevtoolsClientPath()
  const isProductionBuild = !!clientPath && existsSync(clientPath)

  // Serve production-built client (used when package is published)
  if (isProductionBuild && clientPath) {
    nuxt.hook('vite:serverCreated', async (server) => {
      const sirv = await import('sirv').then(r => r.default || r)
      server.middlewares.use(
        DEVTOOLS_UI_ROUTE,
        sirv(clientPath, { dev: true, single: true }),
      )
    })
  }
  // In local development, start a separate Nuxt Server and proxy to serve the client
  else {
    nuxt.hook('vite:extend', ({ config }) => {
      config.server = config.server || {}
      config.server.proxy = config.server.proxy || {}
      config.server.proxy[DEVTOOLS_UI_ROUTE] = {
        target: `http://localhost:${DEVTOOLS_UI_LOCAL_PORT}${DEVTOOLS_UI_IFRAME_SRC}`,
        changeOrigin: true,
        followRedirects: true,
        rewrite: path => path.replace(DEVTOOLS_UI_ROUTE, ''),
      }
    })
  }

  nuxt.hook('devtools:customTabs' as any, (tabs: any[]) => {
    tabs.push({
      // unique identifier
      name: 'rstore',
      // title to display in the tab
      title: 'rstore',
      // any icon from Iconify, or a URL to an image
      icon: `${DEVTOOLS_UI_ROUTE}/logo.png`,
      // iframe view
      view: {
        type: 'iframe',
        src: DEVTOOLS_UI_IFRAME_SRC,
      },
    })
  })
}
