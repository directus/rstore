import type { ResolvedNuxtDevtoolsOptions } from './options'
import { createBrowserDevtools } from '@rstore/devtools/browser'
import { createVueDevtoolsAdapter } from '@rstore/devtools/vue'

/** HMR cleanup handles; session identity never survives runtime replacement. */
const ownedRuntimes = new Set<ReturnType<typeof createBrowserDevtools>>()

/** Create instrumentation before store construction using role-scoped same-origin token. */
export async function createNuxtBrowserDevtools(options: ResolvedNuxtDevtoolsOptions, appBase = '/') {
  const base = `/${[...appBase.split('/'), ...options.base.split('/')].filter(Boolean).join('/')}/`
  const response = await fetch(`${base}bootstrap.json`, { credentials: 'same-origin' })
  if (!response.ok)
    throw new Error(`rstore devtools bootstrap failed: ${response.status}`)
  const bootstrap = await response.json() as { baseURL: string, authToken: string, protocolVersion: number }
  if (bootstrap.protocolVersion !== 1)
    throw new Error('rstore devtools protocol mismatch')
  const runtime = createBrowserDevtools({ baseURL: bootstrap.baseURL, authToken: bootstrap.authToken })
  ownedRuntimes.add(runtime)
  return {
    runtime,
    plugin: runtime.plugin({ id: 'default', adapter: createVueDevtoolsAdapter(), readOnly: options.readOnly }),
    dispose() {
      ownedRuntimes.delete(runtime)
      runtime.dispose()
    },
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const runtime of ownedRuntimes)
      runtime.dispose()
    ownedRuntimes.clear()
  })
}
