export default defineEventHandler((event) => {
  const { type, id } = getRouterParams(event) as { type: keyof Db, id: string }
  const item = db[type].find(item => item.id === id)

  if (!item) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Item not found',
    })
  }

  return item
})
