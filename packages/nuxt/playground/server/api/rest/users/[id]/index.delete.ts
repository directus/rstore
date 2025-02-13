export default defineEventHandler((event) => {
  const { id } = getRouterParams(event) as { id: string }
  const userIndex = db.users.findIndex(user => user.id === id)

  if (userIndex === -1) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    })
  }

  db.users.splice(userIndex, 1)

  return { message: 'User deleted successfully' }
})
