import type { VueStore } from '@rstore/vue'
import type { App } from 'vue'
import { createStore } from '@rstore/vue'
import { reportRuntimeStatus } from '../tutorial/reporting'
import { schema } from './schema'

export async function setupRstore(_app: App) {
  await createStore({
    schema,
  })

  reportRuntimeStatus({
    storeReady: false,
    transportMode: 'hooks',
  })
}

declare module '@rstore/vue' {
  export function useStore(): VueStore<typeof schema>
}
