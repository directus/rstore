import type { VueStore } from '@rstore/vue'
import type { App } from 'vue'
import { createStore } from '@rstore/vue'
import { schema } from './schema'

export async function setupRstore(_app: App) {
  await createStore({
    schema,
  })
}

declare module '@rstore/vue' {
  export function useStore(): VueStore<typeof schema>
}
