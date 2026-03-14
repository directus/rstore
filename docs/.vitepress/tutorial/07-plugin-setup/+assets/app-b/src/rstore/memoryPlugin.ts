import { definePlugin } from '@rstore/vue'
import { memoryBackend } from '../tutorial/backend'
import { reportRuntimeStatus } from '../tutorial/reporting'

function getPath(collection: { meta?: { path?: string } }) {
  return collection.meta?.path as 'todos' | 'users' | undefined
}

export const memoryPlugin = definePlugin({
  name: 'memory-plugin',
  setup({ hook }) {
    hook('init', () => {
      reportRuntimeStatus({
        transportMode: 'plugin',
      })
    })

    hook('fetchFirst', ({ collection, key, setResult }) => {
      const path = getPath(collection)

      if (!path || key == null) {
        return
      }

      setResult(memoryBackend.get(path, String(key)))
    })

    hook('fetchMany', ({ collection, setResult }) => {
      const path = getPath(collection)

      if (!path) {
        return
      }

      setResult(memoryBackend.list(path))
    })

    hook('createItem', ({ collection, item, setResult }) => {
      const path = getPath(collection)

      if (!path) {
        return
      }

      setResult(memoryBackend.create(path, item))
    })

    hook('updateItem', ({ collection, key, item, setResult }) => {
      const path = getPath(collection)

      if (!path || key == null) {
        return
      }

      setResult(memoryBackend.update(path, String(key), item))
    })

    hook('deleteItem', ({ collection, key }) => {
      const path = getPath(collection)

      if (!path || key == null) {
        return
      }

      memoryBackend.delete(path, String(key))
    })
  },
})
