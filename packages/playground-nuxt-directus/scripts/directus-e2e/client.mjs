import {
  createDirectus,
  rest,
  serverHealth,
  staticToken,
} from '@directus/sdk'
import { DIRECTUS_TOKEN, DIRECTUS_URL } from './constants.mjs'

/**
 * Directus SDK client authenticated as the e2e admin user.
 */
export const directus = createDirectus(DIRECTUS_URL)
  .with(rest())
  .with(staticToken(DIRECTUS_TOKEN))

/**
 * Waits until Directus can serve SDK requests.
 */
export async function waitForDirectus() {
  const startedAt = Date.now()
  const timeout = 90_000

  while (Date.now() - startedAt < timeout) {
    try {
      const health = await directus.request(serverHealth())
      if (health.status === 'ok' || health.status === 'warn') {
        return
      }
    }
    catch {}

    await sleep(1_000)
  }

  throw new Error(`Directus did not become healthy at ${DIRECTUS_URL}`)
}

/**
 * Returns whether an SDK error describes a missing Directus resource.
 */
export function isMissingDirectusResource(error) {
  const code = error?.errors?.[0]?.extensions?.code
  return code === 'FORBIDDEN' || code === 'NOT_FOUND'
}

/**
 * Resolves after the requested number of milliseconds.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
