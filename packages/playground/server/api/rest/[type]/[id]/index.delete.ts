export default defineEventHandler(async (event) => {
  await wait(1500)

  const { type, id } = getRouterParams(event) as { type: keyof Db, id: string }
  const itemIndex = db[type].findIndex(item => item.id === id)

  if (itemIndex === -1) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Item not found',
    })
  }

  db[type].splice(itemIndex, 1)

  return { message: 'Item deleted successfully' }
})
