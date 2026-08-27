/** Create a null-prototype string-keyed record. */
export function createNullRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>
}

/** Copy own enumerable properties into a null-prototype record. */
export function copyNullRecord<T>(source?: Record<string, T>): Record<string, T> {
  const target = createNullRecord<T>()
  if (source) {
    Object.assign(target, source)
  }
  return target
}

/** Check for a non-null, non-array object record. */
export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
