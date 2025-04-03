export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)

  if (session?.user) {
    const userId = session.user.id
    return db.users.find(u => u.id === userId)
  }

  return null
})
