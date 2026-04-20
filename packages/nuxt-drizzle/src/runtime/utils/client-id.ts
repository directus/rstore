/**
 * Stable per-tab client id used to tag mutations initiated by this client so
 * the realtime handler can skip sending the corresponding update frame back
 * to the originator (avoids optimistic-update echo / flicker).
 *
 * Empty string on the server — no clientId is attached during SSR since there
 * is no realtime peer to identify.
 */
let clientId: string | null = null

/**
 * Returns a stable client id for the current browsing context.
 * Returns an empty string when called on the server.
 */
export function getRstoreDrizzleClientId(): string {
  if (!import.meta.client) {
    return ''
  }
  if (!clientId) {
    clientId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
  return clientId
}

/**
 * HTTP header used to tag REST requests with the originating client id.
 */
export const RSTORE_DRIZZLE_CLIENT_ID_HEADER = 'X-Rstore-Client-Id'
