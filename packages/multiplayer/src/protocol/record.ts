/** Returns whether a value is a non-array object (internal: not part of the public entries). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
