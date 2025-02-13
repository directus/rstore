import { z } from 'zod'

const bodySchema = z.object({
  name: z.string(),
  email: z.string().email(),
  avatar: z.string(),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  const newUser: User = {
    id: crypto.randomUUID(),
    ...body,
    createdAt: new Date(),
  }
  db.users.push(newUser)
  return newUser
})
