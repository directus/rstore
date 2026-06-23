/**
 * Resolve a potentially dot-separated field path to its leaf field name.
 */
export function leafFieldName(field: string): string {
  const dotIndex = field.lastIndexOf('.')
  return dotIndex !== -1 ? field.slice(dotIndex + 1) : field
}
