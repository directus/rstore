/**
 * Creates a minimal JSON fetch `Response` for REST and schema loading tests.
 */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
    },
    status,
  })
}
