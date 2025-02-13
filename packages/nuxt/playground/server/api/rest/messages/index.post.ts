import { z } from 'zod'

const bodySchema = z.object({
  authorId: z.string(),
  recipientId: z.string(),
  text: z.string(),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  const newMessage: Message = {
    id: crypto.randomUUID(),
    ...body,
    createdAt: new Date(),
  }
  db.messages.push(newMessage)
  return newMessage
})
