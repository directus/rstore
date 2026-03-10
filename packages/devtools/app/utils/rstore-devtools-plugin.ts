import type { App, InjectionKey, Plugin } from 'vue'
import type { RstoreDevtoolsClient } from '../../src/types'

import { inject, provide } from 'vue'

const rstoreDevtoolsClientKey: InjectionKey<RstoreDevtoolsClient> = Symbol('rstore-devtools-client')

export function provideRstoreDevtoolsClient(client: RstoreDevtoolsClient) {
  provide(rstoreDevtoolsClientKey, client)
}

export function useRstoreDevtoolsClient() {
  const client = inject(rstoreDevtoolsClientKey)
  if (!client) {
    throw new Error('Rstore devtools client was not provided')
  }
  return client
}

export function createRstoreDevtoolsPlugin(client: RstoreDevtoolsClient): Plugin {
  return {
    install(app: App) {
      app.provide(rstoreDevtoolsClientKey, client)
    },
  }
}
