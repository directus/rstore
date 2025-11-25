import { z } from 'zod'

const querySchema = z.object({
  filter: z.string().optional(),
  include: z.string().optional(),
  sort: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
  cursor: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  await wait(500)
  const { type } = getRouterParams(event) as { type: keyof Db }
  let result = db[type]

  const query = await getValidatedQuery(event, querySchema.parse)

  if (query.filter) {
    const filters = query.filter.split(',').map(filter => filter.split(':'))
    result = result.filter((item) => {
      return filters.every(([key, value]) => {
        return item[key as keyof typeof item] === value
      })
    }) as Db[keyof Db]
  }

  if (query.include) {
    const include = JSON.parse(query.include) as Record<string, any>
    if (type === 'dataSources' && include.collections) {
      (result as any[]).forEach((source) => {
        source.collections = db.dataCollections.filter(c => c.dataSourceId === source.id)
        if (include.collections.fields) {
          source.collections.forEach((collection: any) => {
            collection.fields = db.dataFields.filter(f => f.dataCollectionId === collection.id)
          })
        }
      })
    }
  }

  const totalCount = result.length

  if (query.sort) {
    const [key, direction] = query.sort.split(':')
    result = result.toSorted((a, b) => {
      if (a[key as keyof typeof a] < b[key as keyof typeof b]) {
        return direction === 'desc' ? 1 : -1
      }
      if (a[key as keyof typeof a] > b[key as keyof typeof b]) {
        return direction === 'desc' ? -1 : 1
      }
      return 0
    }) as Db[keyof Db]
  }

  if (query.cursor != null) {
    const cursorIndex = result.findIndex(item => item.id === query.cursor)
    if (cursorIndex !== -1) {
      result = result.slice(cursorIndex + 1) as Db[keyof Db]
    }
  }
  else if (query.offset != null) {
    result = result.slice(Number.parseInt(query.offset)) as Db[keyof Db]
  }

  if (query.limit != null) {
    result = result.slice(0, Number.parseInt(query.limit)) as Db[keyof Db]
  }

  return {
    result,
    meta: {
      totalCount,
    },
  }
})
