import { z } from 'zod'

const querySchema = z.object({
  filter: z.string().optional(),
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

  return result
})
