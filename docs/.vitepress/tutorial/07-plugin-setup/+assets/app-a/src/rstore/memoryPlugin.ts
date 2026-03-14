import { definePlugin } from '@rstore/vue'
import { reportRuntimeStatus } from '../tutorial/reporting'

export const memoryPlugin = definePlugin({
  name: 'memory-plugin',
  setup({ hook }) {
    hook('init', () => {
      reportRuntimeStatus({
        transportMode: 'plugin',
      })
    })
  },
})
