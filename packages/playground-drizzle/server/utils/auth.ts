import { D1Adapter } from '@lucia-auth/adapter-sqlite'
import { GitHub } from 'arctic'
import { Lucia } from 'lucia'

export function initializeLucia() {
  const adapter = new D1Adapter(hubDatabase(), {
    user: 'user',
    session: 'session',
  })
  return new Lucia(adapter, {
    sessionCookie: {
      attributes: {
        secure: !import.meta.dev,
      },
    },
    getUserAttributes: (attributes) => {
      return {
        username: attributes.username,
        name: attributes.name,
      }
    },
  })
}

export const github = new GitHub(
  import.meta.env.GITHUB_CLIENT_ID!,
  import.meta.env.GITHUB_CLIENT_SECRET!,
  import.meta.dev ? 'http://localhost:3000/api/login/github/callback' : 'https://rstore-playground-drizzle.pages.dev/api/login/github/callback',
)

declare module 'lucia' {
  interface Register {
    Lucia: ReturnType<typeof initializeLucia>
    DatabaseUserAttributes: DatabaseUserAttributes
  }
}

interface DatabaseUserAttributes {
  name: string
  username: string
}
