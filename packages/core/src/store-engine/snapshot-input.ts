import type { CacheStateInput, CacheTombstone, CustomHookMeta, FieldTimestamps, FieldTimestampValue } from '@rstore/shared'
import type { NormalizedCacheSnapshot, NormalizedCollectionRows } from './internal-types.js'
import { isCacheTombstone } from '@rstore/shared'
import { getLegacyModuleKey } from './module-key.js'
import { createNullRecord, isObjectRecord } from './records.js'

/** Validate and detach snapshot containers before queueing hydration. */
export function normalizeSnapshotInput(value: CacheStateInput): NormalizedCacheSnapshot {
  if (!isObjectRecord(value)) {
    throw new TypeError('Cache snapshot must be an object')
  }
  const version = own(value, '$rstoreVersion') ? value.$rstoreVersion : undefined
  if (version !== undefined && version !== 1) {
    throw new TypeError(`Unsupported cache snapshot version: ${String(version)}`)
  }

  if (version === 1) {
    requireOwnFields(value, ['collections', 'markers', 'modules', 'queryMeta'])
    const modules = normalizeVersionedModules(value.modules)
    return {
      collections: normalizeCollections(value.collections),
      markers: normalizeMarkers(value.markers),
      ...modules,
      queryMeta: normalizeQueryMeta(value.queryMeta),
      fieldTimestamps: normalizeFieldTimestamps(value.fieldTimestamps),
      tombstones: normalizeTombstones(value.tombstones),
    }
  }

  return {
    collections: normalizeCollections(value.collections ?? {}),
    markers: normalizeMarkers(value.markers ?? {}),
    modules: new Map(),
    legacyModules: normalizeLegacyModules(value.modules ?? {}),
    queryMeta: normalizeQueryMeta(value.queryMeta ?? {}),
    fieldTimestamps: normalizeFieldTimestamps(value.fieldTimestamps),
    tombstones: normalizeTombstones(value.tombstones),
  }
}

/** Validate detached per-field causal timestamps from an optional snapshot field. */
function normalizeFieldTimestamps(value: unknown): Map<string, Map<string, FieldTimestamps>> {
  const result = new Map<string, Map<string, FieldTimestamps>>()
  if (value === undefined) {
    return result
  }
  if (!isObjectRecord(value)) {
    throw new TypeError('Cache snapshot fieldTimestamps must be an object record')
  }
  for (const collectionName of Object.keys(value)) {
    const rows = value[collectionName]
    if (!isObjectRecord(rows)) {
      throw new TypeError(`Cache snapshot fieldTimestamps for "${collectionName}" must be an object record`)
    }
    const normalized = new Map<string, FieldTimestamps>()
    for (const key of Object.keys(rows)) {
      const timestamps = rows[key]
      if (!isObjectRecord(timestamps)) {
        throw new TypeError(`Cache snapshot timestamps for "${collectionName}"/${key} must be an object record`)
      }
      const copy: FieldTimestamps = {}
      for (const field of Object.keys(timestamps)) {
        const timestamp = timestamps[field]
        if (typeof timestamp !== 'string' && typeof timestamp !== 'number') {
          throw new TypeError(`Cache snapshot timestamp for "${collectionName}"/${key}/${field} must be string or number`)
        }
        copy[field] = timestamp as FieldTimestampValue
      }
      normalized.set(key, copy)
    }
    result.set(collectionName, normalized)
  }
  return result
}

/** Validate detached deletion tombstones from an optional snapshot field. */
function normalizeTombstones(value: unknown): CacheTombstone[] | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!Array.isArray(value)) {
    throw new TypeError('Cache snapshot tombstones must be an array')
  }
  return value.map((entry, index) => {
    if (!isCacheTombstone(entry)) {
      throw new TypeError(`Cache snapshot tombstone at index ${index} is invalid`)
    }
    return { ...entry }
  })
}

/** Validate collection container shapes while retaining item values. */
function normalizeCollections(value: unknown): Map<string, NormalizedCollectionRows> {
  if (!isObjectRecord(value)) {
    throw new TypeError('Cache snapshot collections must be an object record')
  }
  const result = new Map<string, NormalizedCollectionRows>()
  for (const name of Object.keys(value)) {
    const collection = value[name]
    if (!isObjectRecord(collection)) {
      throw new TypeError(`Cache snapshot collection "${name}" must be an object record`)
    }
    const keys = Object.keys(collection)
    result.set(name, { keys, values: keys.map(key => collection[key]) })
  }
  return result
}

/** Validate marker values and detach prototype-sensitive keys. */
function normalizeMarkers(value: unknown): Record<string, boolean> {
  if (!isObjectRecord(value)) {
    throw new TypeError('Cache snapshot markers must be an object record')
  }
  const result = createNullRecord<boolean>()
  for (const key of Object.keys(value)) {
    if (typeof value[key] !== 'boolean') {
      throw new TypeError(`Cache snapshot marker "${key}" must be boolean`)
    }
    result[key] = value[key]
  }
  return result
}

/** Validate query metadata containers. */
function normalizeQueryMeta(value: unknown): Record<string, CustomHookMeta> {
  if (!isObjectRecord(value)) {
    throw new TypeError('Cache snapshot queryMeta must be an object record')
  }
  const result = createNullRecord<CustomHookMeta>()
  for (const key of Object.keys(value)) {
    const meta = value[key]
    if (!isObjectRecord(meta)) {
      throw new TypeError(`Cache snapshot queryMeta entry "${key}" must be an object`)
    }
    result[key] = meta as CustomHookMeta
  }
  return result
}

/** Split validated version-1 modules into exact and legacy registries. */
function normalizeVersionedModules(value: unknown): Pick<NormalizedCacheSnapshot, 'modules' | 'legacyModules'> {
  const modules = new Map<string, Map<string, unknown>>()
  const legacyModules = new Map<string, unknown>()
  if (!Array.isArray(value)) {
    throw new TypeError('Version 1 cache snapshot modules must be an array')
  }
  const exactLegacyKeys = new Set<string>()
  for (const entry of normalizeModuleArray(value)) {
    if ('legacyKey' in entry) {
      if (legacyModules.has(entry.legacyKey)) {
        throw new TypeError(`Duplicate legacy cache module key "${entry.legacyKey}"`)
      }
      if (exactLegacyKeys.has(entry.legacyKey)) {
        throw new TypeError(`Cache snapshot contains exact and legacy module entries for "${entry.legacyKey}"`)
      }
      legacyModules.set(entry.legacyKey, entry.state)
      continue
    }
    const legacyKey = getLegacyModuleKey(entry.name, entry.key)
    if (legacyModules.has(legacyKey)) {
      throw new TypeError(`Cache snapshot contains exact and legacy module entries for "${legacyKey}"`)
    }
    const byKey = modules.get(entry.name) ?? new Map<string, unknown>()
    if (byKey.has(entry.key)) {
      throw new TypeError(`Duplicate cache module tuple "${entry.name}"/"${entry.key}"`)
    }
    byKey.set(entry.key, entry.state)
    modules.set(entry.name, byKey)
    exactLegacyKeys.add(legacyKey)
  }
  return { modules, legacyModules }
}

/** Validate and normalize every version-1 module array entry. */
function normalizeModuleArray(value: unknown[]): Array<{ name: string, key: string, state: unknown } | { legacyKey: string, state: unknown }> {
  return value.map((entry, index) => {
    if (!isObjectRecord(entry) || !own(entry, 'state')) {
      throw new TypeError(`Cache snapshot module at index ${index} must be an object with state`)
    }
    const exact = typeof entry.name === 'string' && typeof entry.key === 'string'
    const legacy = typeof entry.legacyKey === 'string'
    if (exact === legacy) {
      throw new TypeError(`Cache snapshot module at index ${index} must contain either name/key or legacyKey`)
    }
    return exact
      ? { name: entry.name as string, key: entry.key as string, state: entry.state }
      : { legacyKey: entry.legacyKey as string, state: entry.state }
  })
}

/** Validate a versionless delimiter-keyed module record. */
function normalizeLegacyModules(value: unknown): Map<string, unknown> {
  if (!isObjectRecord(value)) {
    throw new TypeError('Legacy cache snapshot modules must be an object record')
  }
  return new Map(Object.keys(value).map(key => [key, value[key]]))
}

/** Require complete version-1 top-level shape. */
function requireOwnFields(value: Record<string, unknown>, fields: string[]): void {
  for (const field of fields) {
    if (!own(value, field)) {
      throw new TypeError(`Version 1 cache snapshot is missing "${field}"`)
    }
  }
}

/** Safe own-property check for prototype-like keys. */
function own(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}
