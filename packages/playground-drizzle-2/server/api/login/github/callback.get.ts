import { OAuth2RequestError } from 'arctic'
import { and, eq, sql } from 'drizzle-orm'
import { generateId } from 'lucia'

export default defineEventHandler(async (event) => {
  const lucia = event.context.lucia
  const db = useDrizzle()
  const query = getQuery(event)
  const code = query.code?.toString() ?? null
  const state = query.state?.toString() ?? null
  const storedState = getCookie(event, 'github_oauth_state') ?? null

  if (!code || !state || !storedState || state !== storedState) {
    throw createError({
      status: 400,
    })
  }

  try {
    const tokens = await github.validateAuthorizationCode(code)
    const githubUserResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
      },
    })
    const githubUser: GitHubUser = await githubUserResponse.json()
    const existingUser = await db
      .select()
      .from(tables.oauthAccounts)
      .where(
        and(
          eq(tables.oauthAccounts.providerId, 'github'),
          eq(tables.oauthAccounts.providerUserId, sql.placeholder('id')),
        ),
      )
      .prepare()
      .get({ id: githubUser.id })

    if (existingUser) {
      const session = await lucia.createSession(existingUser.userId, {})
      appendHeader(
        event,
        'Set-Cookie',
        lucia.createSessionCookie(session.id).serialize(),
      )
      return sendRedirect(event, '/')
    }

    const userId = generateId(15)
    await db.batch([
      db.insert(tables.users).values({
        id: userId,
        username: githubUser.login,
        avatar: githubUser.avatar_url,
      }),
      db.insert(tables.oauthAccounts).values({
        id: crypto.randomUUID(),
        providerId: 'github',
        providerUserId: githubUser.id,
        userId,
      }),
    ])
    const session = await lucia.createSession(userId, {})
    appendHeader(
      event,
      'Set-Cookie',
      lucia.createSessionCookie(session.id).serialize(),
    )
    return sendRedirect(event, '/')
  }
  catch (e) {
    console.error(e)
    // the specific error message depends on the provider
    if (e instanceof OAuth2RequestError) {
      // invalid code
      throw createError({
        status: 400,
      })
    }
    throw createError({
      status: 500,
    })
  }
})

interface GitHubUser {
  id: string
  login: string
  avatar_url: string
}
