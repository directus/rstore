import { generateId, Scrypt } from 'lucia'

export default defineEventHandler(async (event) => {
  const lucia = event.context.lucia
  const db = event.context.db
  const formData = await readFormData(event)
  const username = formData.get('username')
  const password = formData.get('password')

  if (
    typeof username !== 'string'
    || username.length < 3
    || username.length > 31
    || !/^[a-z0-9_-]+$/.test(username)
  ) {
    throw createError({
      message: 'Invalid username',
      statusCode: 400,
    })
  }

  if (
    typeof password !== 'string'
    || password.length < 6
    || password.length > 255
  ) {
    throw createError({
      message: 'Invalid password',
      statusCode: 400,
    })
  }

  const hashedPassword = await new Scrypt().hash(password)
  const userId = generateId(15)

  try {
    await db.insert(tables.users).values({
      id: userId,
      username,
      hashedPassword,
    })

    const session = await lucia.createSession(userId, {})
    appendHeader(
      event,
      'Set-Cookie',
      lucia.createSessionCookie(session.id).serialize(),
    )
  }
  catch {
    // db error, email taken, etc
    throw createError({
      status: 400,
      statusMessage: 'Username already exists',
    })
  }
})
