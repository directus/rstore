import type { StoreRegistration } from '../runtime/types'
import { projectValue } from '../projection'

/** Shared hook registration function, supplied by actual store/plugin API. */
export type RegisterHook = (name: any, callback: (payload: any) => void) => () => void
/** Bounded correlation metadata never retains argument/result values. */
interface PendingOperation {
  /** Local event correlation ID. */
  id: number
  /** Maximum correlation lifetime. */
  expires: number
  /** Duplicate metadata means completion order cannot establish identity. */
  count: number
  /** Concurrent reuse prevents assigning a unique history ID. */
  correlatable: boolean
  /** Owning weak-metadata bucket; never retain metadata itself. */
  pair: Map<string, PendingOperation>
  /** Stable hook lifecycle identity within its metadata bucket. */
  identity: string
}

/** Install observational hooks; every callback isolates diagnostic failures. */
export function installInstrumentation(hook: RegisterHook, getRegistration: () => StoreRegistration | undefined): () => void {
  let nextId = 0
  const correlations = new WeakMap<object, Map<string, PendingOperation>>()
  const pending = new Map<number, PendingOperation>()
  const completed = new Map<number, PendingOperation>()
  const cleanups: Array<() => void> = []
  /** Release both global evidence and its per-metadata candidate together. */
  function release(candidate: PendingOperation) {
    pending.delete(candidate.id)
    completed.delete(candidate.id)
    if (candidate.pair.get(candidate.identity) === candidate)
      candidate.pair.delete(candidate.identity)
  }
  /** Register an observation without changing the application's payload/result. */
  function observe(name: string, callback: (registration: StoreRegistration, payload: any) => void) {
    cleanups.push(hook(name, (payload) => {
      try {
        const registration = getRegistration()
        if (registration && payload.store === registration.store)
          callback(registration, payload)
      }
      catch { /* Tooling failures must preserve original application behavior. */ }
    }))
  }
  /** Prefer Core invocation identity; legacy metadata stays conservatively ambiguous. */
  function operation(registration: StoreRegistration, payload: any, family: string, phase: 'start' | 'complete' | 'error', many = payload.many) {
    const now = Date.now()
    for (const candidate of pending.values()) {
      if (candidate.expires <= now)
        release(candidate)
    }
    for (const candidate of completed.values()) {
      if (candidate.expires <= now)
        release(candidate)
    }
    const description = family === 'fetch' ? (payload.many ? 'fetchMany' : 'fetchFirst') : payload.mutation
    // Invocation identity survives target rewrites and metadata reuse. Keep
    // cardinality separate so bulk per-item hooks cannot complete parent work.
    // Legacy stores lack invocation identity; create still has no initial key.
    const invocation = payload.operation
    const key = invocation || (family === 'mutation' && description === 'create') ? undefined : payload.key
    const identity = JSON.stringify([family, description, !!many, payload.collection.name, key])
    const context = invocation ?? payload.meta
    let pair = correlations.get(context)
    let operationId: number | undefined
    if (phase === 'start') {
      pair ??= new Map()
      correlations.set(context, pair)
      if ((pair.get(identity)?.count ?? 0) > 0) {
        // Reusing custom metadata concurrently supplies no unique operation ID.
        // Remove correlation rather than pair a later completion incorrectly.
        const candidate = pair.get(identity)!
        candidate.correlatable = false
        candidate.count++
      }
      else if (pending.size < 1000) {
        const previous = pair.get(identity)
        if (previous)
          release(previous)
        operationId = ++nextId
        const expires = now + 5 * 60 * 1000
        const candidate = { id: operationId, expires, count: 1, correlatable: true, pair, identity }
        if (family === 'mutation' && description === 'create') {
          const other = pair.get(JSON.stringify([family, description, !many, payload.collection.name, key]))
          if (other && other.count > 0) {
            // Bulk fallback emits per-item afterMutation hooks. Reusing its
            // metadata for a live single create cannot identify those hooks.
            other.correlatable = candidate.correlatable = false
            operationId = undefined
          }
        }
        pending.set(candidate.id, candidate)
        pair.set(identity, candidate)
      }
    }
    else {
      const candidate = pair?.get(identity)
      if (candidate && candidate.correlatable && pending.delete(candidate.id)) {
        operationId = candidate.id
        if (phase === 'complete') {
          completed.set(candidate.id, candidate)
          if (completed.size > 1000)
            release(completed.values().next().value!)
        }
      }
      else if (phase === 'error' && invocation && candidate && completed.delete(candidate.id)) {
        // Core afterFetch precedes relation/cache processing. A failure there
        // still belongs to the same operation, even after its result hook.
        operationId = candidate.id
      }
      if (candidate && candidate.count > 0)
        candidate.count--
      if (candidate && candidate.count === 0 && !completed.has(candidate.id))
        release(candidate)
    }
    registration.history.record({
      operation: description,
      phase,
      operationId,
      collection: payload.collection.name,
      key: payload.key,
      arguments: phase === 'start' ? { item: payload.item, items: payload.items, keys: payload.keys, findOptions: payload.findOptions } : undefined,
      result: phase === 'complete' ? payload.getResult?.() : undefined,
      error: phase === 'error' ? payload.error : undefined,
    })
  }

  observe('beforeFetch', (registration, payload) => operation(registration, payload, 'fetch', 'start'))
  observe('afterFetch', (registration, payload) => operation(registration, payload, 'fetch', 'complete'))
  observe('fetchError', (registration, payload) => operation(registration, payload, 'fetch', 'error'))
  for (const name of ['beforeMutation', 'beforeManyMutation'])
    observe(name, (registration, payload) => operation(registration, payload, 'mutation', 'start', name === 'beforeManyMutation'))
  for (const name of ['afterMutation', 'afterManyMutation'])
    observe(name, (registration, payload) => operation(registration, payload, 'mutation', 'complete', name === 'afterManyMutation'))
  observe('mutationError', (registration, payload) => operation(registration, payload, 'mutation', 'error'))

  for (const name of ['afterCacheWrite', 'afterCacheReset', 'cacheLayerAdd', 'cacheLayerRemove', 'cacheConflict', 'itemGarbageCollect']) {
    observe(name, (registration, payload) => {
      registration.history.record({ operation: name, phase: 'event', collection: payload.collection?.name, key: payload.key, result: payload.result ?? payload.item ?? (payload.layer ? { id: payload.layer.id, optimistic: payload.layer.optimistic } : undefined) })
      registration.invalidate('cache')
      registration.invalidate('collections')
    })
  }
  for (const name of ['batch', 'batchFetch', 'batchMutate']) {
    observe(name, (registration, payload) => {
      const operations: Array<{ type: string, key?: string | number, collection: string }> = []
      // Projection bounds cannot undo an eager full-source map. Bound metadata
      // traversal first, leaving tail descriptors untouched even before detach.
      const count = Math.min(payload.operations.length, 1000)
      for (let index = 0; index < count; index++) {
        const operation = payload.operations[index]
        operations.push({ type: operation.type, key: operation.key, collection: operation.collection.name })
      }
      registration.history.record({
        operation: name,
        phase: 'event',
        collection: payload.collection?.name,
        truncated: count < payload.operations.length ? true : undefined,
        arguments: { group: payload.group, operations },
      })
    })
  }
  observe('subscribe', (registration, payload) => {
    if (registration.subscriptions.size >= 1000 && !registration.subscriptions.has(payload.subscriptionId))
      return
    registration.subscriptions.set(payload.subscriptionId, {
      id: payload.subscriptionId,
      collection: payload.collection.name,
      key: payload.key,
      findOptions: projectValue(payload.findOptions, { unwrap: registration.adapter?.unwrap }).value,
      startedAt: Date.now(),
    })
    registration.invalidate('subscriptions')
  })
  observe('unsubscribe', (registration, payload) => {
    registration.subscriptions.delete(payload.subscriptionId)
    registration.invalidate('subscriptions')
  })
  observe('moduleResolved', registration => registration.invalidate('modules'))
  observe('dispose', registration => registration.dispose())
  return () => {
    for (const candidate of pending.values())
      release(candidate)
    for (const candidate of completed.values())
      release(candidate)
    for (const cleanup of cleanups) {
      try {
        cleanup()
      }
      catch { /* One observer cleanup must not leak the remaining hooks. */ }
    }
    cleanups.length = 0
  }
}
