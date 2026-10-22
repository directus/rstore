import type { InspectableStore } from '@rstore/devtools'
import type { ResolvedNuxtDevtoolsOptions } from './options'
import { createBrowserDevtools } from '@rstore/devtools/browser'
import { createVueDevtoolsAdapter } from '@rstore/devtools/vue'

/** HMR cleanup handles; session identity never survives runtime replacement. */
const ownedRuntimes = new Set<ReturnType<typeof createBrowserDevtools>>()
/** Pending HTTP work must also end when this module is replaced. */
const pendingBootstraps = new Set<AbortController>()

/** Fetch credentials under one deadline, including response body parsing. */
async function fetchBootstrap(url: string, signal?: AbortSignal) {
  const controller = new AbortController()
  pendingBootstraps.add(controller)
  /** Forward application departure into optional network discovery. */
  const abort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted)
    abort()
  const timeout = setTimeout(() => controller.abort(new Error('rstore devtools bootstrap timed out')), 5000)
  /** Fetch/body implementations may settle after cancellation; never use their result. */
  const cancelled = new Promise<never>((_, reject) => {
    if (controller.signal.aborted)
      reject(controller.signal.reason)
    else
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
  })
  try {
    return await Promise.race([
      (async () => {
        controller.signal.throwIfAborted()
        const response = await fetch(url, { credentials: 'same-origin', signal: controller.signal })
        if (!response.ok)
          throw new Error(`rstore devtools bootstrap failed: ${response.status}`)
        const bootstrap = await response.json() as { baseURL: string, authToken: string, protocolVersion: number }
        controller.signal.throwIfAborted()
        return bootstrap
      })(),
      cancelled,
    ])
  }
  finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
    pendingBootstraps.delete(controller)
    controller.abort()
  }
}

/** Attach optional diagnostics after application store has been created and hydrated. */
export async function createNuxtBrowserDevtools(options: ResolvedNuxtDevtoolsOptions, store: InspectableStore, appBase = '/', signal?: AbortSignal) {
  const base = `/${[...appBase.split('/'), ...options.base.split('/')].filter(Boolean).join('/')}/`
  const bootstrap = await fetchBootstrap(`${base}bootstrap.json`, signal)
  signal?.throwIfAborted()
  if (bootstrap.protocolVersion !== 1)
    throw new Error('rstore devtools protocol mismatch')
  const runtime = createBrowserDevtools({ baseURL: bootstrap.baseURL, authToken: bootstrap.authToken })
  try {
    runtime.attachStore(store, { id: 'default', adapter: createVueDevtoolsAdapter(), readOnly: options.readOnly })
  }
  catch (error) {
    runtime.dispose()
    throw error
  }
  ownedRuntimes.add(runtime)
  return {
    runtime,
    dispose() {
      ownedRuntimes.delete(runtime)
      runtime.dispose()
    },
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const controller of pendingBootstraps)
      controller.abort()
    pendingBootstraps.clear()
    for (const runtime of ownedRuntimes)
      runtime.dispose()
    ownedRuntimes.clear()
  })
}
