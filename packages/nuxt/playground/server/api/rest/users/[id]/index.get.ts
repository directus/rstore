export default defineEventHandler((event) => {
  const { id } = getRouterParams(event) as { id: string }
  const user = db.users.find(user => user.id === id)

  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    })
  }

  return user
})
