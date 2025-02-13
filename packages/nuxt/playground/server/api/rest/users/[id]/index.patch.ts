import { z } from 'zod'

const bodySchema = z.object({
  name: z.string(),
  email: z.string().email(),
  avatar: z.string(),
}).partial()

export default defineEventHandler(async (event) => {
  const { id } = getRouterParams(event) as { id: string }
  const body = await readValidatedBody(event, bodySchema.parse)
  const userIndex = db.users.findIndex(user => user.id === id)

  if (userIndex === -1) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    })
  }

  const updatedUser: User = {
    ...db.users[userIndex],
    ...body,
  }

  db.users[userIndex] = updatedUser

  return updatedUser
})
