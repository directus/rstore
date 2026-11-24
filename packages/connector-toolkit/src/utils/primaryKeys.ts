/**
 * Resolves generated primary keys, defaulting to the conventional `id` key.
 *
 * The fallback is allocated per call so callers can safely extend it without
 * leaking fields into a later mutation or adapter collection.
 */
export function resolveGeneratedPrimaryKeys(primaryKeys: string[] | undefined): string[] {
  return primaryKeys?.length ? primaryKeys : ['id']
}
