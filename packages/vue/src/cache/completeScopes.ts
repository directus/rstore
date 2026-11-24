import type { CacheScope, CacheScopes, FieldTimestampValue } from '@rstore/shared'
import type { CacheRuntime } from './types'
import { compareHLC, IncompleteCacheScopeError, selectEvictions } from '@rstore/core'
import { shallowReactive } from 'vue'
import { isQueryStateHeld } from './queryHolders'
import { queueQueryStateSweep } from './queryRetention'

interface ScopeRecord {
  /** Cache lifetime of this partition, fencing restores and resets. */
  lifetime: symbol
  /** Completed authoritative result exists in this partition. */
  complete: boolean
  /** Last comparable complete snapshot revision. */
  revision?: FieldTimestampValue
  /** Local accepted writes since the record was allocated. */
  generation: number
  /** Sequence of the most recently applied snapshot request. */
  accepted: number
  /** Last read, write or release, for retention. */
  usedAt: number
  /** Requests sharing the partition fence. */
  pending: number
  /** Query consumers that currently use the partition. */
  holders: Set<string>
}

/** Identity of one collection index bucket. */
function scopeKey(collection: string, scope: CacheScope): string {
  return JSON.stringify([collection, scope.field, scope.value])
}

/** Reconcile and retain complete index partitions independently of query pages. */
export function createCompleteScopes(ctx: CacheRuntime) {
  const records = shallowReactive(new Map<string, ScopeRecord>())
  const fields = new Map<string, Set<string>>()
  let sequence = 0
  let expiryQueued = false

  const api: CacheScopes = {
    begin(collection, scope) {
      if (collection.indexes.get(scope.field)?.join(':') !== scope.field)
        throw new IncompleteCacheScopeError(scope)
      const key = scopeKey(collection.name, scope)
      const existing = records.get(key) ?? { lifetime: Symbol('complete cache scope'), complete: false, generation: 0, accepted: 0, usedAt: Date.now(), pending: 0, holders: new Set<string>() }
      const registered = fields.get(collection.name) ?? new Set()
      registered.add(scope.field)
      fields.set(collection.name, registered)
      existing.pending++
      records.set(key, existing)
      const generation = existing.generation
      const request = ++sequence
      return {
        replace: (rows, { revision, canPublish }) => ctx.engine.replaceScope({
          collection,
          scope,
          rows,
          canApply() {
            const current = records.get(key)
            return !!current && current.lifetime === existing.lifetime
              && current.generation === generation && canPublish?.() !== false
              && (current.revision != null && revision != null
                ? compareHLC(revision, current.revision) >= 0
                : request >= current.accepted)
          },
          onApplied() {
            const current = records.get(key)!
            records.set(key, { ...current, accepted: request, complete: true, revision: revision ?? current.revision, usedAt: Date.now() })
          },
        }),
        release() {
          const current = records.get(key)
          if (current?.lifetime === existing.lifetime) {
            current.pending--
            current.usedAt = Date.now()
            if (ctx.queryStateRetention && records.size > ctx.queryStateRetention.maxSize && !expiryQueued) {
              expiryQueued = true
              setTimeout(() => {
                expiryQueued = false
                if (!ctx.disposed)
                  queueQueryStateSweep(ctx, true)
              }, 0)
            }
          }
        },
      }
    },
    isComplete(collection, scope) {
      const record = records.get(scopeKey(collection.name, scope))
      if (record)
        record.usedAt = Date.now()
      return record?.complete ?? false
    },
  }

  return {
    api,
    /** Record scope changes from ordinary accepted writes and mark GC losses incomplete. */
    change(collection: string, before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined, evicted = false) {
      for (const field of fields.get(collection) ?? []) {
        for (const value of new Set([before?.[field], after?.[field]])) {
          if (typeof value !== 'string' && typeof value !== 'number')
            continue
          const key = scopeKey(collection, { field, value })
          const record = records.get(key)
          if (!record)
            continue
          record.generation++
          if (evicted && record.complete)
            records.set(key, { ...record, complete: false })
        }
      }
    },
    /** Revoke a complete read without treating an access denial as deletion. */
    invalidate(collection: string, scope: CacheScope) {
      const key = scopeKey(collection, scope)
      const entry = records.get(key)
      if (entry)
        records.set(key, { ...entry, complete: false, generation: entry.generation + 1 })
    },
    /** Keep the completeness record while a query is mounted. */
    hold(collection: string, scope: CacheScope, queryId: string) {
      records.get(scopeKey(collection, scope))?.holders.add(queryId)
    },
    /** Bound inactive scoped reads, including complete empty partitions. */
    sweep(now: number) {
      if (!ctx.queryStateRetention)
        return
      const inactive: Array<[string, number]> = []
      for (const [key, record] of records) {
        for (const holder of record.holders) {
          if (!isQueryStateHeld(ctx.state, holder))
            record.holders.delete(holder)
        }
        if (!record.pending && !record.holders.size)
          inactive.push([key, record.usedAt])
      }
      for (const key of selectEvictions(inactive, ctx.queryStateRetention, now))
        records.delete(key)
    },
    /** Drop snapshot assertions at a cache or collection reset. */
    clear(collection?: string) {
      if (collection === undefined) {
        records.clear()
        fields.clear()
      }
      else {
        for (const key of records.keys()) {
          if (key.startsWith(`[${JSON.stringify(collection)},`))
            records.delete(key)
        }
        fields.delete(collection)
      }
    },
  }
}
