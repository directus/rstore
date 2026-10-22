import type { RstoreDevframeDefinition, RstoreDevframeOptions } from './options'
import { defineDevframe } from 'devframe'
import { packagedClientDirectory, packagedVersion } from './assets'
import { createRoleAuth } from './auth'
import { registerRelayHandlers } from './handlers'
import { normalizeRstoreBase } from './paths'
import { createProducerRegistry } from './producer-registry'
import { registerSSRHandlers } from './ssr-handlers'
import { registerWatchHandlers } from './watch'

/** Portable authenticated relay definition; server mounting stays behind Node entry. */
export function createRstoreDevframe(options: RstoreDevframeOptions = {}): RstoreDevframeDefinition {
  const registry = createProducerRegistry(options.runtime?.session.sessionId)
  const auth = createRoleAuth(options.authTokens)
  let unsubscribe: (() => void) | undefined
  let invalidate: ((event: unknown) => void) | undefined
  let disposeSSR: (() => void) | undefined
  let watches: ReturnType<typeof registerWatchHandlers> | undefined
  const relay = {
    auth: auth.handler,
    rejectCredential: auth.rejectCredential,
    onPeerDisconnect(connection: import('devframe').DevframeRpcConnection) {
      registry.disconnect(connection.id)
      watches?.disconnect(connection.id)
      invalidate?.({ view: 'registry', revision: Date.now() })
    },
    dispose() {
      unsubscribe?.()
      watches?.dispose()
      disposeSSR?.()
      registry.dispose()
    },
  }
  const definition = defineDevframe({
    id: 'rstore',
    name: 'RStore Devtools',
    version: packagedVersion(),
    packageName: '@rstore/devtools',
    importMetaUrl: import.meta.url,
    homepage: 'https://rstore.dev',
    description: 'Inspect connected RStore development stores.',
    basePath: normalizeRstoreBase(options.basePath),
    capabilities: { build: false },
    clientAssets: options.clientDir ?? packagedClientDirectory(),
    cli: { host: '127.0.0.1', auth: relay.auth },
    setup(context) {
      auth.initialize(context)
      watches = registerWatchHandlers(context, registry, options.runtime)
      disposeSSR = registerSSRHandlers(context, registry, auth)
      const handlers = registerRelayHandlers(context, registry, auth, options.runtime, (producerId, sessionId) => {
        if (sessionId)
          watches?.detach(sessionId, producerId)
        else watches?.disconnect(producerId)
      })
      unsubscribe = handlers.unsubscribe
      invalidate = handlers.invalidate
    },
  })
  return Object.assign(definition, { relay })
}
