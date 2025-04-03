export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { email, password } = body
  await wait(1000) // Simulate a network delay
  if (email === db.users[0].email && password === 'admin') {
    const userId = db.users[0].id
    await setUserSession(event, {
      user: {
        id: userId,
      },
    })
    return {
      userId,
    }
  }
  else {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid username or password',
    })
  }
})
