import type { SSRRetention } from './types'
import { DevtoolsError } from '../protocol'
import { isBoundedJson } from '../protocol/json'

/** Count, TTL and encoded memory limits; explicit clock supports deterministic algorithms. */
export interface SSRRetentionOptions {
  /** Completed record maximum, default 50. */
  maxRecords?: number
  /** Completion-age limit, default five minutes. */
  ttlMs?: number
  /** Aggregate encoded bytes, default 32 MiB. */
  maxBytes?: number
  /** Individual encoded capture maximum, default 512 KiB. */
  maxSnapshotBytes?: number
  /** Current epoch milliseconds. */
  now?: () => number
}

/** Store only JSON-detached DTOs and expire from completion, not read time. */
export function createSSRRetention(options: SSRRetentionOptions = {}): SSRRetention {
  const maxRecords = options.maxRecords ?? 50
  const ttlMs = options.ttlMs ?? 5 * 60_000
  const maxBytes = options.maxBytes ?? 32 * 1024 * 1024
  const maxSnapshotBytes = options.maxSnapshotBytes ?? 512 * 1024
  const now = options.now ?? Date.now
  for (const limit of [maxRecords, ttlMs, maxBytes, maxSnapshotBytes]) {
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new RangeError('SSR retention limits must be positive integers')
  }
  const records = new Map<string, { json: string, bytes: number, completedAt: number }>()
  let bytes = 0
  let disposed = false
  /** Remove oldest completion first; insertion/reconnect order carries no authority. */
  function oldest() {
    return [...records].sort((a, b) => a[1].completedAt - b[1].completedAt)[0]?.[0]
  }
  /** Release one detached encoded record. */
  function remove(id: string) {
    const record = records.get(id)
    if (record) {
      bytes -= record.bytes
      records.delete(id)
    }
  }
  /** TTL never extends when a viewer reads a capture. */
  function prune() {
    const time = now()
    for (const [id, record] of records) {
      if (time - record.completedAt >= ttlMs)
        remove(id)
    }
  }
  return {
    get bytes() {
      prune()
      return bytes
    },
    add(snapshot) {
      if (disposed)
        throw new Error('SSR retention disposed')
      if (!isBoundedJson(snapshot, { maxBytes: Math.min(maxSnapshotBytes, maxBytes), maxDepth: 64, maxEntries: maxSnapshotBytes, omitUndefinedProperties: true }))
        throw new DevtoolsError({ code: 'CAPACITY', message: 'SSR snapshot exceeds byte budget or contains invalid data' })
      const json = JSON.stringify(snapshot)
      const size = new TextEncoder().encode(json).length
      if (size > maxSnapshotBytes || size > maxBytes)
        throw new DevtoolsError({ code: 'CAPACITY', message: 'SSR snapshot exceeds byte budget' })
      if (!snapshot.session.completed || snapshot.session.kind !== 'ssr' || !Number.isFinite(snapshot.request.completedAt))
        throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: 'SSR retention requires completed request' })
      prune()
      if (now() - snapshot.request.completedAt >= ttlMs)
        return
      const previous = records.get(snapshot.session.sessionId)
      if (previous) {
        if (previous.json !== json)
          throw new DevtoolsError({ code: 'COMMAND_CONFLICT', message: 'Completed SSR identity is immutable' })
        return
      }
      remove(snapshot.session.sessionId)
      records.set(snapshot.session.sessionId, { json, bytes: size, completedAt: snapshot.request.completedAt })
      bytes += size
      while (records.size > maxRecords || bytes > maxBytes)
        remove(oldest()!)
    },
    get(id) {
      prune()
      const record = records.get(id)
      return record ? JSON.parse(record.json) : undefined
    },
    list() {
      prune()
      return [...records.values()].sort((a, b) => b.completedAt - a.completedAt).map(record => JSON.parse(record.json))
    },
    ids() {
      prune()
      return [...records.keys()]
    },
    prune,
    dispose() {
      disposed = true
      records.clear()
      bytes = 0
    },
  }
}
