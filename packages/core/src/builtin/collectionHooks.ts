import { definePlugin } from '../plugin'

export const builtinCollectionHooksPlugin = definePlugin({
  name: 'rstore-collection-hooks',

  category: 'remote',

  before: {
    categories: ['remote'],
  },

  meta: {
    builtin: true,
    description: 'Handle hooks defined on collections',
  },

  setup({ hook }) {
    hook('fetchFirst', async ({ collection, findOptions, setResult }) => {
      if (collection.hooks?.fetchFirst) {
        setResult(await collection.hooks.fetchFirst(findOptions as any))
      }
    })

    hook('fetchMany', async ({ collection, findOptions, setResult }) => {
      if (collection.hooks?.fetchMany) {
        setResult(await collection.hooks.fetchMany(findOptions as any))
      }
    })

    hook('createItem', async ({ collection, item, setResult }) => {
      if (collection.hooks?.create) {
        setResult(await collection.hooks.create({ item }))
      }
    })

    hook('updateItem', async ({ collection, key, item, setResult }) => {
      if (collection.hooks?.update) {
        setResult(await collection.hooks.update({ key, item }))
      }
    })

    hook('deleteItem', async ({ collection, key }) => {
      if (collection.hooks?.delete) {
        await collection.hooks.delete({ key })
      }
    })
  },
})
