import { useRequestFetch } from '#app'
// @ts-expect-error virtual module
import { apiPath } from '#build/$rstore-drizzle-config.js'
import { definePlugin, type VueStore } from '@rstore/vue'
import { and, eq } from './utils/where'
import { filterWhere } from './where'

export default definePlugin({
  name: 'rstore-drizzle',

  // @TODO multi directus instances
  scopeId: 'rstore-drizzle',

  setup({ addModelDefaults, hook }) {
    function parseDate(value: any): Date {
      return typeof value === 'string' ? new Date(value) : value
    }

    // @TODO configurable or auto-generate from tables
    addModelDefaults({
      fields: {
        createdAt: {
          parse: parseDate,
        },
        updatedAt: {
          parse: parseDate,
        },
      },
    })

    /* Fetch */

    const requestFetch = useRequestFetch()

    hook('fetchFirst', async (payload) => {
      if (payload.key) {
        const result = await requestFetch(`${apiPath}/${payload.model.name}/${payload.key}`, {
          query: payload.findOptions?.params,
        })
        if (result) {
          payload.setResult(result)
        }
        else {
          console.warn(`No result found for ${payload.model.name} with key ${payload.key}`)
        }
      }
      else {
        const result: any = await requestFetch(`${apiPath}/${payload.model.name}`, {
          query: {
            where: payload.findOptions?.where,
            ...payload.findOptions?.params,
            limit: 1,
          },
        })
        payload.setResult(result?.[0])
      }
    })

    hook('fetchMany', async (payload) => {
      // @ts-expect-error excessive stack depth
      payload.setResult(await requestFetch(`${apiPath}/${payload.model.name}`, {
        query: {
          where: payload.findOptions?.where,
          ...payload.findOptions?.params,
        },
      }))
    })

    hook('fetchRelations', async (payload) => {
      const store = payload.store as VueStore
      const payloadResult = payload.getResult()
      const items: any[] = Array.isArray(payloadResult) ? payloadResult : [payloadResult]
      await Promise.all(items.map(async (item) => {
        const key = payload.model.getKey(item)
        if (key) {
          // Get the full wrapped item with computed props etc.
          const wrappedItem = store.$cache.readItem({
            model: payload.model,
            key,
          })
          if (!wrappedItem) {
            return
          }

          for (const relationKey in payload.findOptions.include) {
            if (!payload.findOptions.include[relationKey]) {
              continue
            }

            const relation = payload.model.relations[relationKey]
            if (!relation) {
              throw new Error(`Relation "${relationKey}" does not exist on model "${payload.model.name}"`)
            }

            await Promise.all(Object.keys(relation.to).map((modelName) => {
              const relationData = relation.to[modelName]!
              const where: any[] = []
              for (const key in relationData.on) {
                where.push(eq(key, wrappedItem[relationData.on[key]!]))
              }
              return store.$model(modelName).findMany({
                where: and(...where),
              })
            }))
          }
        }
      }))
    })

    /* Cache */

    hook('cacheFilterFirst', (payload) => {
      const where = payload.findOptions?.where ?? payload.findOptions?.params?.where
      if (where) {
        const items = payload.readItemsFromCache()
        payload.setResult(items.find(item => filterWhere(item, where)))
      }
    })

    hook('cacheFilterMany', (payload) => {
      const where = payload.findOptions?.where ?? payload.findOptions?.params?.where
      const orderBy = payload.findOptions?.params?.orderBy

      if (where || orderBy) {
        let items = payload.getResult()

        // Filter
        if (where) {
          items = items.filter(item => filterWhere(item, where))
        }

        // Order by
        if (orderBy) {
          items.sort((a: any, b: any) => {
            for (const param of orderBy) {
              const [key, order] = param.split('.')
              if (a[key!] < b[key!]) {
                return order === 'asc' ? -1 : 1
              }
              if (a[key!] > b[key!]) {
                return order === 'asc' ? 1 : -1
              }
            }
            return 0
          })
        }

        payload.setResult(items)
      }
    })

    /* Mutations */

    hook('createItem', async (payload) => {
      const result: any = await requestFetch(`${apiPath}/${payload.model.name}`, {
        method: 'POST',
        body: payload.item,
      })
      payload.setResult(result)
    })

    hook('updateItem', async (payload) => {
      const result: any = await requestFetch(`${apiPath}/${payload.model.name}/${payload.key}`, {
        method: 'PATCH',
        body: {
          ...payload.item,
          id: undefined,
        },
      })
      payload.setResult(result)
    })

    hook('deleteItem', async (payload) => {
      await requestFetch(`${apiPath}/${payload.model.name}/${payload.key}`, {
        method: 'DELETE',
      })
    })
  },
})
