export default defineEventHandler((event) => {
  const { id } = getRouterParams(event) as { id: string }
  const messageIndex = db.messages.findIndex(message => message.id === id)

  if (messageIndex === -1) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Message not found',
    })
  }

  db.messages.splice(messageIndex, 1)

  return { message: 'Message deleted successfully' }
})
