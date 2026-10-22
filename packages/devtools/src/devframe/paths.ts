/** Canonical mount path consumed by every server integration. */
export function normalizeRstoreBase(path = '/__rstore/'): string {
  if (path.includes('?') || path.includes('#') || path.includes('..'))
    throw new TypeError('Invalid devtools base path')
  return `/${path.split('/').filter(Boolean).join('/')}${path.split('/').filter(Boolean).length ? '/' : ''}`
}

/** Parse HTTP discovery base without accepting URL credentials or query secrets. */
export function producerBaseURL(input: string): URL {
  const url = new URL(input)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new TypeError('Expected HTTP devtools base URL without credentials')
  url.pathname = normalizeRstoreBase(url.pathname)
  return url
}
