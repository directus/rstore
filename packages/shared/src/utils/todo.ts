/**
 * @deprecated Throw an explicit domain error instead. Retained for existing
 * consumers that use this placeholder helper.
 */
export function todo<T>(message: string): T {
  throw new Error(`Not implemented: ${message}`)
}
