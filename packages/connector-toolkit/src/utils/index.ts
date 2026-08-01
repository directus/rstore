/**
 * Normalizes a possible single result to an array.
 */
export function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return []
  }
  return Array.isArray(value) ? value : [value]
}

/**
 * Returns whether a value is a plain record object.
 */
export function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
