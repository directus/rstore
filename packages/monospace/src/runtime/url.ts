/**
 * Removes exactly one trailing slash from a URL.
 */
export function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}
