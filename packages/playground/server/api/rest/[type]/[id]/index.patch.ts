export default defineEventHandler(async (event) => {
  const { type, id } = getRouterParams(event) as { type: keyof Db, id: string }
  const schema = updateValidationSchemas[type]
  const body = await readValidatedBody(event, data => schema.parse(data))
  const itemIndex = db[type].findIndex(item => item.id === id)

  if (itemIndex === -1) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Item not found',
    })
  }

  const updatedItem = {
    ...db[type][itemIndex],
    ...body,
    updatedAt: new Date(),
  }

  db[type][itemIndex] = updatedItem

  return updatedItem
})
