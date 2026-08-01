/**
 * Origin validation for the WebSocket upgrade.
 *
 * Browsers attach cookies to cross-site WebSocket handshakes and do NOT
 * enforce CORS on them, so without this check any third-party page could
 * open an authenticated socket (cross-site WebSocket hijacking). The
 * default policy only accepts same-origin upgrades (Origin host matches
 * the request Host); apps may extend it with an explicit allowlist or
 * disable it entirely.
 */

/**
 * Allowed-origins policy:
 * - `undefined` — same-origin only (default)
 * - `string[]` — same-origin plus the listed origins (e.g. `https://app.example.com`)
 * - `false` — accept any origin (opt out entirely)
 */
export type MultiplayerAllowedOrigins = string[] | false | undefined

/**
 * Returns `true` when the upgrade request's `Origin` header satisfies the
 * policy. Requests without an `Origin` header (non-browser clients) are
 * accepted — cross-site WebSocket hijacking only concerns browsers, which
 * always send the header.
 *
 * @param origin Value of the `Origin` request header (or `null`/`undefined` when absent).
 * @param host Value of the `Host` request header.
 * @param allowedOrigins Additional allowed origins or `false` to disable the check.
 */
export function isOriginAllowed(
  origin: string | null | undefined,
  host: string | null | undefined,
  allowedOrigins?: MultiplayerAllowedOrigins,
): boolean {
  if (allowedOrigins === false) {
    return true
  }

  // Non-browser clients (curl, server-to-server) omit Origin — allow.
  if (!origin) {
    return true
  }

  // Explicit allowlist entries are matched as full origins.
  if (Array.isArray(allowedOrigins) && allowedOrigins.includes(origin)) {
    return true
  }

  // Same-origin check: Origin host (incl. port) must match the Host header.
  if (!host) {
    return false
  }
  try {
    return new URL(origin).host === host
  }
  catch {
    // Malformed Origin header — treat as hostile.
    return false
  }
}
