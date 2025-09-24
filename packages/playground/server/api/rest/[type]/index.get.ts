import { z } from 'zod'

const querySchema = z.object({
  filter: z.string().optional(),
  include: z.string().optional(),
})

export default defineEventHandler(async (event) => {
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

  return result
})
