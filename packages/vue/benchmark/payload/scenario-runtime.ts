import type { Cache, ResolvedCollection } from '@rstore/shared'
import type { CacheImplementation } from '../runtime'
import type { PayloadScenarioRuntime } from './types'
import { createCacheRuntime } from '../runtime'
import { invariant } from '../scenario-harness'
import { approximateSourceBytes, mutateSource } from './data'

/** Direct-cache runtime state shared by payload scenarios. */
export interface DirectPayloadContext {
  /** Cache under measurement. */
  cache: Cache
  /** Primary collection. */
  collection: ResolvedCollection<any, any, any>
  /** All resolved collections. */
  collections: ResolvedCollection<any, any, any>[]
}

/** Create one direct-cache payload runtime. */
export function createDirectPayloadContext(implementation: CacheImplementation, schema: any[]): DirectPayloadContext {
  const runtime = createCacheRuntime(implementation, schema)
  return { cache: runtime.cache, collection: runtime.collections[0]!, collections: runtime.collections }
}

/** Convert records into public batch write entries. */
export function keyed(records: readonly any[]): Array<{ key: string | number, value: any }> {
  return records.map(item => ({ key: item.id, value: item }))
}

/** Validate serialized collection cardinality without retaining snapshot output. */
export function validateCardinality(cache: Cache, collection: string, expected: number): void {
  const state = cache.getState()
  invariant(Object.keys(state.collections[collection] ?? {}).length === expected, `${collection} cardinality changed`)
}

/** Finish source ownership, validation, and exactly-once cache disposal. */
export function finishPayloadRuntime(options: {
  /** Cache owned by scenario. */
  cache?: Cache
  /** Caller-owned source graph. */
  source?: any[]
  /** Explicit source size for snapshots or pre-seeded workflows. */
  sourceBytes?: number
  /** Measured workflow. */
  operate: () => void | Promise<void>
  /** Semantic validation after source mutation/release. */
  validate: () => void | Promise<void>
  /** Additional teardown before cache disposal. */
  teardown?: () => void | Promise<void>
  /** Release scenario-local reference to caller source. */
  onReleaseSource?: () => void
  /** Whether generic release should mutate input before dropping it. */
  mutateSourceOnRelease?: boolean
}): PayloadScenarioRuntime {
  let source = options.source
  let disposed = false
  const sourceBytes = options.sourceBytes ?? approximateSourceBytes(source ?? [])
  return {
    sourceBytes,
    operate: options.operate,
    releaseSource() {
      if (options.mutateSourceOnRelease !== false)
        mutateSource(source)
      options.onReleaseSource?.()
      source = undefined
      options.source = undefined
    },
    validate: options.validate,
    async teardown() {
      invariant(!disposed, 'payload runtime disposed more than once')
      disposed = true
      await options.teardown?.()
      options.cache?.dispose()
    },
  }
}
