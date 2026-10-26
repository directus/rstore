import type { Resolver } from '@nuxt/kit'
import type { Nuxt } from 'nuxt/schema'
import type { ResolvedNuxtDevtoolsOptions } from './runtime/devtools/options'
import { randomBytes } from 'node:crypto'
import { addServerPlugin, runWithNuxtContext, updateRuntimeConfig } from '@nuxt/kit'

/** Mount shared host once and keep private SSR authority outside browser config. */
export async function setupDevToolsUI(nuxt: Nuxt, resolver: Resolver, options: ResolvedNuxtDevtoolsOptions): Promise<void> {
  const { configureDevtoolsServer } = await import('@rstore/devtools/vite')
  const authToken = randomBytes(32).toString('hex')
  const privateConfig = { baseURL: '', authToken }
  nuxt.options.runtimeConfig.rstoreDevtoolsSSR = privateConfig
  addServerPlugin(resolver.resolve('./runtime/devtools/nitro'))
  const appBase = nuxt.options.app.baseURL
  const base = `/${[...appBase.split('/'), ...options.base.split('/')].filter(Boolean).join('/')}/`
  let publicOrigin = ''
  let cleanup: (() => Promise<void>) | undefined
  // Nitro clones runtime config before the listener hook in programmatic boots.
  nuxt.hook('nitro:config', (config) => {
    config.runtimeConfig ||= {}
    config.runtimeConfig.rstoreDevtoolsSSR = privateConfig
  })
  // Nitro modules may extend its resolved runtime config; read it live on publish
  // since every updateConfig swaps in a new object.
  let nitroOptions: { runtimeConfig: Record<string, unknown> } | undefined
  nuxt.hook('nitro:init', (nitro) => {
    nitroOptions = nitro.options
  })
  /** Publish late listening address to Nitro's actual resolved config/worker. */
  async function publishPrivateConfig() {
    nuxt.options.runtimeConfig.rstoreDevtoolsSSR = { ...privateConfig }
    // Nitro's updateConfig replaces its normalized config; preserve app/public keys
    // and keys only Nitro modules wrote there (e.g. nitro-cloudflare-dev's `wrangler`).
    const runtimeConfig = {
      ...nuxt.options.nitro.runtimeConfig,
      ...nuxt.options.runtimeConfig,
      ...nitroOptions?.runtimeConfig,
      rstoreDevtoolsSSR: { ...privateConfig },
    }
    await runWithNuxtContext(nuxt, () => updateRuntimeConfig(runtimeConfig))
  }
  /** Resolve dynamic listening port without configuration guesses. */
  nuxt.hook('listen', async (server, listener) => {
    const address = server.address()
    if (address && typeof address !== 'string') {
      const scheme = String(listener.url ?? '').startsWith('https:') ? 'https' : 'http'
      publicOrigin = `${scheme}://127.0.0.1:${address.port}`
      privateConfig.baseURL = `${publicOrigin}${base}`
      await publishPrivateConfig()
    }
  })
  nuxt.hook('vite:serverCreated', async (server, environment) => {
    if (!environment.isClient || cleanup)
      return
    cleanup = await configureDevtoolsServer(server, {
      base: options.base,
      applicationBase: appBase,
      // Nitro owns frontend upgrades; middleware-mode Vite uses official sidecar.
      origin: () => publicOrigin,
      ssrAuthTokens: [authToken],
      onReady(info) {
        if (info.baseURL !== privateConfig.baseURL) {
          privateConfig.baseURL = info.baseURL
          void publishPrivateConfig()
        }
      },
    })
  })
  nuxt.hook('close', async () => {
    await cleanup?.()
  })
  nuxt.hook('devtools:customTabs' as any, (tabs: any[]) => {
    tabs.push({ name: 'rstore', title: 'rstore', icon: `${base}logo.png`, view: { type: 'iframe', src: base } })
  })
}
