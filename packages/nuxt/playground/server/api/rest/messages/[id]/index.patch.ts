import { z } from 'zod'

const bodySchema = z.object({
  text: z.string(),
}).partial()

export default defineEventHandler(async (event) => {
  const { id } = getRouterParams(event) as { id: string }
  const body = await readValidatedBody(event, bodySchema.parse)
  const messageIndex = db.messages.findIndex(message => message.id === id)

  if (messageIndex === -1) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Message not found',
    })
  }

  const updatedMessage: Message = {
    ...db.messages[messageIndex],
    ...body,
    updatedAt: new Date(),
  }

  db.messages[messageIndex] = updatedMessage

  return updatedMessage
})
