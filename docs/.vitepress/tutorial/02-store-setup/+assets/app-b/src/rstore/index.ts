import type { VueStore } from '@rstore/vue'
import type { App } from 'vue'
import { createStore, RstorePlugin } from '@rstore/vue'
import { reportRuntimeStatus } from '../tutorial/reporting'
import { schema } from './schema'

export async function setupRstore(app: App) {
  const store = await createStore({
    schema,
  })

  app.use(RstorePlugin, { store })

  reportRuntimeStatus({
    storeReady: true,
    transportMode: 'hooks',
  })
}

declare module '@rstore/vue' {
  export function useStore(): VueStore<typeof schema>
}
