import type { App } from 'vue'
import type { VueStore } from '@rstore/vue'
import { createStore, RstorePlugin } from '@rstore/vue'
import { setTutorialState } from '../tutorial/bridge'
import { schema } from './schema'

export async function setupRstore(app: App) {
  const store = await createStore({
    schema,
  })

  app.use(RstorePlugin, { store })

  setTutorialState({
    storeReady: true,
    transportMode: 'hooks',
  })
}

declare module '@rstore/vue' {
  export function useStore(): VueStore<typeof schema>
}
