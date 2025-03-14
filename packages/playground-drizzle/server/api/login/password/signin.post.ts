import { eq } from 'drizzle-orm'
import { Scrypt } from 'lucia'

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
      statusMessage: 'Invalid username',
      statusCode: 400,
    })
  }

  if (
    typeof password !== 'string'
    || password.length < 6
    || password.length > 255
  ) {
    throw createError({
      statusMessage: 'Invalid password',
      statusCode: 400,
    })
  }

  const existingUser = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.username, username))
    .get()

  if (!existingUser || !existingUser.hashedPassword) {
    // NOTE:
    // Returning immediately allows malicious actors to figure out valid emails/username from response times,
    // allowing them to only focus on guessing passwords in brute-force attacks.
    // As a preventive measure, you may want to hash passwords even for invalid emails.
    // However, valid emails can be already be revealed with the signup page
    // and a similar timing issue can likely be found in password reset implementation.
    // It will also be much more resource intensive.
    // Since protecting against this is none-trivial,
    // it is crucial your implementation is protected against brute-force attacks with login throttling etc.
    // If emails/usernames are public, you may outright tell the user that the username is invalid.
    throw createError({
      status: 400,
      statusMessage: 'Invalid username or password',
    })
  }

  const validPassword = await new Scrypt().verify(
    existingUser.hashedPassword,
    password,
  )
  if (!validPassword) {
    throw createError({
      status: 400,
      statusMessage: 'Invalid username or password',
    })
  }

  const session = await lucia.createSession(existingUser.id, {})
  appendHeader(
    event,
    'Set-Cookie',
    lucia.createSessionCookie(session.id).serialize(),
  )

  // NOTE: It's recommended to setup a cron-job to delete expired sessions
  await lucia.deleteExpiredSessions()
})
