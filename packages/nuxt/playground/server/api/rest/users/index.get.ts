import { z } from 'zod'

const querySchema = z.object({
  filter: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  let result = db.users

  const query = await getValidatedQuery(event, querySchema.parse)

  if (query.filter) {
    const filters = query.filter.split(',').map(filter => filter.split(':'))
    result = result.filter((user) => {
      return filters.every(([key, value]) => {
        // @ts-ignore
        return user[key] === value
      })
    })
  }

  console.log(result)

  return result
})
