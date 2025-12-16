export function isKeyDefined<T>(key: T): key is NonNullable<T> {
  return key != null
}
