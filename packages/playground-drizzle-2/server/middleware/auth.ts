import type { Session, User } from 'lucia'
import { verifyRequestOrigin } from 'lucia'

let lucia: ReturnType<typeof initializeLucia>

export default defineEventHandler(async (event) => {
  // CSRF protection
  if (!isMethod(event, 'GET')) {
    const originHeader = getHeader(event, 'Origin') ?? null
    const hostHeader = getHeader(event, 'Host') ?? null
    if (
      !originHeader
      || !hostHeader
      || !verifyRequestOrigin(originHeader, [hostHeader])
    ) {
      return sendNoContent(event, 403)
    }
  }

  if (!lucia) {
    lucia = initializeLucia()
  }

  event.context.lucia = lucia

  // Set session and user
  const sessionId = getCookie(event, lucia.sessionCookieName) ?? null
  if (!sessionId) {
    event.context.session = null
    event.context.user = null
    return
  }

  const { session, user } = await lucia.validateSession(sessionId)
  if (session && session.fresh) {
    appendResponseHeader(
      event,
      'Set-Cookie',
      lucia.createSessionCookie(session.id).serialize(),
    )
  }
  if (!session) {
    appendResponseHeader(
      event,
      'Set-Cookie',
      lucia.createBlankSessionCookie().serialize(),
    )
  }

  event.context.session = session
  event.context.user = user
})

declare module 'h3' {
  interface H3EventContext {
    user: User | null
    session: Session | null
    lucia: ReturnType<typeof initializeLucia>
  }
}
