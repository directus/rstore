import type { VueStore } from '@rstore/vue'
// @ts-expect-error virtual module
import { apiPath } from '#build/$rstore-drizzle-config.js'
import { useRequestFetch } from '#imports'
import { definePlugin } from '@rstore/vue'
import SuperJSON from 'superjson'
import { and, eq } from './utils/where'
import { filterWhere } from './where'

export default definePlugin({
  name: 'rstore-drizzle',

  category: 'remote',

  // @TODO multi drizzle instances
  scopeId: 'rstore-drizzle',

  setup({ addCollectionDefaults, hook }) {
    function parseDate(value: any): Date {
      return typeof value === 'string' ? new Date(value) : value
    }

    // @TODO configurable or auto-generate from tables
    addCollectionDefaults({
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
        const result = await requestFetch(`${apiPath}/${payload.collection.name}/${payload.key}`, {
          query: { superjson: SuperJSON.stringify(payload.findOptions?.params) },
        })
        if (result) {
          payload.setResult(result)
        }
        else {
          console.warn(`No result found for ${payload.collection.name} with key ${payload.key}`)
        }
      }
      else {
        const result: any = await requestFetch(`${apiPath}/${payload.collection.name}`, {
          query: { superjson: SuperJSON.stringify({
            where: payload.findOptions?.where,
            ...payload.findOptions?.params,
            limit: 1,
          }) },
        })
        payload.setResult(result?.[0])
      }
    })

    hook('fetchMany', async (payload) => {
      // @ts-expect-error excessive stack depth
      payload.setResult(await requestFetch(`${apiPath}/${payload.collection.name}`, {
        query: { superjson: SuperJSON.stringify({
          where: payload.findOptions?.where,
          ...payload.findOptions?.params,
        }) },
      }))
    })

    hook('fetchRelations', async (payload) => {
      const store = payload.store as VueStore
      const payloadResult = payload.getResult()
      const items: any[] = Array.isArray(payloadResult) ? payloadResult : [payloadResult]
      await Promise.all(items.map(async (item) => {
        const key = payload.collection.getKey(item)
        if (key) {
          // Get the full wrapped item with computed props etc.
          const wrappedItem = store.$cache.readItem({
            collection: payload.collection,
            key,
          })
          if (!wrappedItem) {
            return
          }

          for (const relationKey in payload.findOptions.include) {
            if (!payload.findOptions.include[relationKey]) {
              continue
            }

            const relation = payload.collection.normalizedRelations[relationKey]
            if (!relation) {
              throw new Error(`Relation "${relationKey}" does not exist on collection "${payload.collection.name}"`)
            }

            await Promise.all(relation.to.map((target) => {
              const where: any[] = []
              for (const key in target.on) {
                where.push(eq(key, wrappedItem[target.on[key]!]))
              }
              return store.$collection(target.collection).findMany({
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
      const result: any = await requestFetch(`${apiPath}/${payload.collection.name}`, {
        method: 'POST',
        body: SuperJSON.stringify(payload.item),
      })
      payload.setResult(result)
    })

    hook('updateItem', async (payload) => {
      const result: any = await requestFetch(`${apiPath}/${payload.collection.name}/${payload.key}`, {
        method: 'PATCH',
        body: SuperJSON.stringify({
          ...payload.item,
          id: undefined,
        }),
      })
      payload.setResult(result)
    })

    hook('deleteItem', async (payload) => {
      await requestFetch(`${apiPath}/${payload.collection.name}/${payload.key}`, {
        method: 'DELETE',
      })
    })
  },
})
