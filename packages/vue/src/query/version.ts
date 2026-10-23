import type { CustomHookMeta, FieldTimestampValue } from '@rstore/shared'

/** Serialized HLC prefix: hexadecimal physical and logical parts, then a node id. */
const HLC_PATTERN = /^[\da-f]+:[\da-f]+:/i

/** Fetch metadata objects whose invalid version was already reported. */
const warnedFetchMeta = new WeakSet<CustomHookMeta>()

/**
 * Whether `compareHLC` can order a result version: a finite number or a
 * serialized HLC string (`stringifyHLC`). Transaction ids and LSNs must be
 * encoded into one of these formats by the connector.
 */
export function isValidResultVersion(version: unknown): version is FieldTimestampValue {
  return typeof version === 'number' ? Number.isFinite(version) : typeof version === 'string' && HLC_PATTERN.test(version)
}

/**
 * Reject a pushed version the comparator cannot order. Throwing at the
 * `setResult` call keeps the error with the connector instead of surfacing
 * later from a queued publication.
 */
export function assertPushVersion(version: FieldTimestampValue | undefined): void {
  if (version != null && !isValidResultVersion(version))
    throw new TypeError(`[rstore] Invalid result version "${String(version)}": expected a finite number or a serialized HLC string.`)
}

/**
 * Read the version a fetch hook set on its metadata. An invalid version is
 * reported once per fetch and treated as unversioned, so it can neither reject
 * the fetch for every deduped consumer nor be stored as the page version.
 */
export function readFetchVersion(meta: CustomHookMeta): FieldTimestampValue | undefined {
  const version = meta.$resultVersion
  if (version == null || isValidResultVersion(version))
    return version
  if (!warnedFetchMeta.has(meta)) {
    warnedFetchMeta.add(meta)
    console.warn(`[rstore] Ignoring invalid $resultVersion "${String(version)}": expected a finite number or a serialized HLC string. The result is treated as unversioned.`)
  }
  return undefined
}
