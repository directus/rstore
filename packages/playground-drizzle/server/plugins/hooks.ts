/* eslint-disable no-console */

export default defineNitroPlugin(() => {
  rstoreDrizzleHooks.hook('index.get.before', async (payload) => {
    console.log('index.get.before', payload.collection, payload.query, payload.params)
  })
  rstoreDrizzleHooks.hook('index.get.after', async (payload) => {
    console.log('index.get.after', payload.collection)
  })
  rstoreDrizzleHooks.hook('index.post.before', async (payload) => {
    console.log('index.post.before', payload.collection, payload.body)
  })
  rstoreDrizzleHooks.hook('index.post.after', async (payload) => {
    console.log('index.post.after', payload.collection)
  })
  rstoreDrizzleHooks.hook('item.get.before', async (payload) => {
    console.log('item.get.before', payload.collection, payload.params)
  })
  rstoreDrizzleHooks.hook('item.get.after', async (payload) => {
    console.log('item.get.after', payload.collection)
  })
  rstoreDrizzleHooks.hook('item.patch.before', async (payload) => {
    console.log('item.patch.before', payload.collection, payload.params, payload.body)
  })
  rstoreDrizzleHooks.hook('item.patch.after', async (payload) => {
    console.log('item.patch.after', payload.collection)
  })
  rstoreDrizzleHooks.hook('item.delete.before', async (payload) => {
    console.log('item.delete.before', payload.collection, payload.params)
  })
  rstoreDrizzleHooks.hook('item.delete.after', async (payload) => {
    console.log('item.delete.after', payload.collection)
  })

  hooksForTable(tables.todos, {
    'index.get.before': async (payload) => {
      console.log('Specific hook for todos - index.get.before', payload.collection, payload.query, payload.params)
    },
    'index.get.after': async (payload) => {
      console.log('Specific hook for todos - index.get.after', payload.collection, payload.result.map(r => r.id))
    },
    'item.patch.after': async (payload) => {
      console.log('Specific hook for todos - item.patch.after', payload.collection, payload.result.id)
    },
  })
})
