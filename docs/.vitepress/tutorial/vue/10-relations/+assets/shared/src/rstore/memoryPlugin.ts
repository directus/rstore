import { definePlugin } from '@rstore/vue'

export const memoryPlugin = definePlugin({
  name: 'memory-plugin',
  setup({ hook }) {
    hook('init', () => {
      // Move the collection transport into plugin hooks.
    })
  },
})
