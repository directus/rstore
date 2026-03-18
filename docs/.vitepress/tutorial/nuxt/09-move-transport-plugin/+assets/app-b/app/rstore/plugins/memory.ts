function getPath(collection: { meta?: { path?: string } }) {
  return collection.meta?.path as 'todos' | undefined
}

export default defineRstorePlugin({
  name: 'tutorial-memory-plugin',
  setup({ hook }) {
    hook('fetchFirst', async ({ collection, key, setResult }) => {
      const path = getPath(collection)

      if (!path || key == null) {
        return
      }

      setResult(await $fetch(`/api/${path}/${key}`))
    })

    hook('fetchMany', async ({ collection, setResult }) => {
      const path = getPath(collection)

      if (!path) {
        return
      }

      setResult(await $fetch(`/api/${path}`))
    })

    hook('createItem', async ({ collection, item, setResult }) => {
      const path = getPath(collection)

      if (!path) {
        return
      }

      setResult(await $fetch(`/api/${path}`, {
        method: 'POST',
        body: item,
      }))
    })

    hook('updateItem', async ({ collection, key, item, setResult }) => {
      const path = getPath(collection)

      if (!path || key == null) {
        return
      }

      setResult(await $fetch(`/api/${path}/${key}`, {
        method: 'PATCH',
        body: item,
      }))
    })

    hook('deleteItem', async ({ collection, key }) => {
      const path = getPath(collection)

      if (!path || key == null) {
        return
      }

      await $fetch(`/api/${path}/${key}`, {
        method: 'DELETE',
      })
    })
  },
})
