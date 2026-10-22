import type { NitroApp } from 'nitropack/types'
import { disposeRstoreSSR, finalizeRstoreSSR } from './server'

/** Development-only plugin; module never registers it in production builds. */
export default function rstoreDevtoolsNitroPlugin(nitro: NitroApp) {
  nitro.hooks.hook('afterResponse', (event) => {
    const status = event.node.res.statusCode >= 400 ? 'error' : 'completed'
    finalizeRstoreSSR(event, status)
  })
  nitro.hooks.hook('error', (error, context) => {
    if (context.event)
      finalizeRstoreSSR(context.event, 'error', error)
  })
  nitro.hooks.hook('close', disposeRstoreSSR)
}
