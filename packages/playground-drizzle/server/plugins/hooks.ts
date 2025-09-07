/* eslint-disable no-console */

export default defineNitroPlugin(() => {
  rstoreDrizzleHooks.hook('index.get.before', async (payload) => {
    console.log('index.get.before', payload.model, payload.query, payload.params)
  })
  rstoreDrizzleHooks.hook('index.get.after', async (payload) => {
    console.log('index.get.after', payload.model)
  })
  rstoreDrizzleHooks.hook('index.post.before', async (payload) => {
    console.log('index.post.before', payload.model, payload.body)
  })
  rstoreDrizzleHooks.hook('index.post.after', async (payload) => {
    console.log('index.post.after', payload.model)
  })
  rstoreDrizzleHooks.hook('item.get.before', async (payload) => {
    console.log('item.get.before', payload.model, payload.params)
  })
  rstoreDrizzleHooks.hook('item.get.after', async (payload) => {
    console.log('item.get.after', payload.model)
  })
  rstoreDrizzleHooks.hook('item.patch.before', async (payload) => {
    console.log('item.patch.before', payload.model, payload.params, payload.body)
  })
  rstoreDrizzleHooks.hook('item.patch.after', async (payload) => {
    console.log('item.patch.after', payload.model)
  })
  rstoreDrizzleHooks.hook('item.delete.before', async (payload) => {
    console.log('item.delete.before', payload.model, payload.params)
  })
  rstoreDrizzleHooks.hook('item.delete.after', async (payload) => {
    console.log('item.delete.after', payload.model)
  })
})
