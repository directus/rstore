export default defineEventHandler((event) => {
  const { id } = getRouterParams(event) as { id: string }
  const message = db.messages.find(message => message.id === id)

  if (!message) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Message not found',
    })
  }

  return message
})
