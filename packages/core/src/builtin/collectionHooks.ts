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
    hook('fetchFirst', async ({ collection, findOptions, setResult, abort }) => {
      if (collection.hooks?.fetchFirst) {
        abort()
        setResult(await collection.hooks.fetchFirst(findOptions as any))
      }
    })

    hook('fetchMany', async ({ collection, findOptions, setResult, abort }) => {
      if (collection.hooks?.fetchMany) {
        abort()
        setResult(await collection.hooks.fetchMany(findOptions as any))
      }
    })

    hook('createItem', async ({ collection, item, setResult, abort }) => {
      if (collection.hooks?.create) {
        abort()
        setResult(await collection.hooks.create({ item }))
      }
    })

    hook('updateItem', async ({ collection, key, item, setResult, abort }) => {
      if (collection.hooks?.update) {
        abort()
        setResult(await collection.hooks.update({ key, item }))
      }
    })

    hook('deleteItem', async ({ collection, key, abort }) => {
      if (collection.hooks?.delete) {
        abort()
        await collection.hooks.delete({ key })
      }
    })
  },
})
