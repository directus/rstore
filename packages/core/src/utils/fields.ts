import { fieldValuesEqual } from '@rstore/shared'

/**
 * Compute fields whose values changed between two objects.
 */
export function diffFields(oldObj: Record<string, any>, newObj: Record<string, any>): string[] {
  const changed: string[] = []
  const allFields = new Set([...Object.keys(oldObj), ...Object.keys(newObj)])
  for (const field of allFields) {
    if (!fieldValuesEqual(oldObj[field], newObj[field])) {
      changed.push(field)
    }
  }
  return changed
}
