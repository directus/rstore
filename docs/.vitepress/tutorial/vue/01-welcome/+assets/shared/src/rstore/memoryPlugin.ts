import { definePlugin } from '@rstore/vue'
import { memoryBackend } from './backend'

function getPath(collection: { meta?: { path?: string } }) {
  return collection.meta?.path as 'todos' | 'users' | undefined
}

export const memoryPlugin = definePlugin({
  name: 'memory-plugin',
  setup({ hook }) {
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

    const subscriptions = new Map<string, () => void>()

    hook('subscribe', ({ collection, subscriptionId, store }) => {
      const path = getPath(collection)

      if (path !== 'todos') {
        return
      }

      const stop = memoryBackend.subscribe(path, (event) => {
        if (event.type === 'delete' && event.key) {
          store.$cache.deleteItem({
            collection,
            key: event.key,
          })
          return
        }

        if (!event.item) {
          return
        }

        const key = collection.getKey(event.item)

        if (key == null) {
          return
        }

        store.$cache.writeItem({
          collection,
          key,
          item: event.item,
        })
      })

      subscriptions.set(subscriptionId, stop)
    })

    hook('unsubscribe', ({ subscriptionId }) => {
      subscriptions.get(subscriptionId)?.()
      subscriptions.delete(subscriptionId)
    })
  },
})
