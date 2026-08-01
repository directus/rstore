/**
 * Matches names usable as bare JavaScript/TypeScript identifiers.
 */
export const IDENTIFIER_RE = /^[A-Z_$][\w$]*$/i

/**
 * Options accepted by {@link createGetKeyExpression}.
 */
export interface GetKeyExpressionOptions {
  /**
   * Whether the collection is a singleton keyed by a constant.
   */
  singleton?: boolean
}

/**
 * Formats a field as a TypeScript property name.
 */
export function tsPropertyName(name: string): string {
  return IDENTIFIER_RE.test(name) ? name : JSON.stringify(name)
}

/**
 * Creates a safe JavaScript item property access expression.
 */
export function itemAccessExpression(key: string): string {
  return IDENTIFIER_RE.test(key) ? `item.${key}` : `item[${JSON.stringify(key)}]`
}

/**
 * Creates the generated `getKey` expression body.
 */
export function createGetKeyExpression(
  primaryKeys: string[],
  options: GetKeyExpressionOptions = {},
): string {
  if (options.singleton) {
    return '\'singleton\''
  }
  if (!primaryKeys.length) {
    return 'item.id'
  }
  return primaryKeys
    .map(key => itemAccessExpression(key))
    .join(' + \'::\' + ')
}

/**
 * Creates a valid TypeScript interface name from a collection name.
 *
 * The fallback prefix is prepended when the pascal-cased name is not a
 * valid identifier (for example a name starting with a digit).
 */
export function collectionTypeName(collectionName: string, fallbackPrefix: string): string {
  const name = collectionName
    .split(/[^\w$]+/)
    .filter(Boolean)
    .map(part => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('')

  return IDENTIFIER_RE.test(name) ? name : `${fallbackPrefix}${name || 'Item'}`
}

/**
 * Indents generated source lines.
 */
export function indent(source: string, spaces: number): string {
  const prefix = ' '.repeat(spaces)
  return source
    .split('\n')
    .map(line => line ? `${prefix}${line}` : line)
    .join('\n')
}
