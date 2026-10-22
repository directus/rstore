import type { DevframeNodeContext } from 'devframe'
import type { Target } from '../protocol'
import type { SSRSnapshot } from '../ssr/types'
import type { createRoleAuth } from './auth'
import type { ProducerRegistry } from './producer-registry'
import * as v from 'valibot'
import { DevtoolsError, ReadResultSchemas, SessionRequestSchema, SessionSummarySchema, TargetSchema } from '../protocol'
import { isBoundedJson } from '../protocol/json'
import { createSSRRetention } from '../ssr/retention'
import { readSSRSnapshot, SSR_SNAPSHOT_BYTES } from '../ssr/snapshot'
import { broadcastInvalidation } from './invalidation'
import { sameRpcPeer } from './producer-registry'

/** Every captured store uses the same bounded detached section schemas. */
const ViewsSchema = v.strictObject({
  collections: v.optional(ReadResultSchemas['rstore:get-collections']),
  cache: v.optional(v.record(v.string(), ReadResultSchemas['rstore:get-cache'])),
  history: v.optional(ReadResultSchemas['rstore:get-history']),
  subscriptions: v.optional(ReadResultSchemas['rstore:get-subscriptions']),
  modules: v.optional(ReadResultSchemas['rstore:get-modules']),
  plugins: v.optional(ReadResultSchemas['rstore:get-plugins']),
})
/** Validate detached snapshot envelopes before granting retained selector authority. */
const SnapshotSchema = v.pipe(v.custom<unknown>(input => isBoundedJson(input, {
  maxBytes: SSR_SNAPSHOT_BYTES,
  maxDepth: 64,
  maxEntries: SSR_SNAPSHOT_BYTES,
  omitUndefinedProperties: true,
}), 'Invalid or over-budget SSR snapshot'), v.strictObject({
  session: SessionSummarySchema,
  target: TargetSchema,
  request: v.pipe(SessionRequestSchema, v.check(request => request.status !== 'active', 'Completed SSR request required')),
  views: ViewsSchema,
  additionalStores: v.optional(v.array(v.strictObject({ target: TargetSchema, views: ViewsSchema }))),
  truncated: v.boolean(),
}))

/** Authenticated SSR worker publication; one owned timer expires detached captures. */
export function registerSSRHandlers(context: DevframeNodeContext, registry: ProducerRegistry, auth: ReturnType<typeof createRoleAuth>) {
  const retention = createSSRRetention()
  const published = new Set<string>()
  let disposed = false
  /** Release records evicted by count, bytes or TTL from both ledgers. */
  function prune() {
    const remaining = new Set(retention.ids())
    for (const id of published) {
      if (!remaining.has(id)) {
        registry.remove(id)
        published.delete(id)
      }
    }
  }
  const timer = setInterval(prune, 5000)
  timer.unref?.()
  context.rpc.register({
    name: 'rstore:producer-ssr-snapshot',
    type: 'action',
    args: [SnapshotSchema],
    jsonSerializable: true,
    handler(input: SSRSnapshot) {
      const owner = context.rpc.getCurrentRpcSession()
      if (disposed || auth.requireProducer(owner) !== 'ssr')
        throw new DevtoolsError({ code: 'READ_ONLY', message: 'Private SSR producer credential required' })
      if (new TextEncoder().encode(JSON.stringify(input)).length > SSR_SNAPSHOT_BYTES)
        throw new DevtoolsError({ code: 'CAPACITY', message: 'SSR snapshot exceeds byte budget' })
      if (input.session.kind !== 'ssr' || !input.session.completed || input.session.connected
        || input.session.sessionId !== input.target.sessionId
        || input.session.stores.some(store => !store.capabilities.readOnly || store.capabilities.cacheWrites || store.capabilities.backendMutations || store.target.sessionId !== input.target.sessionId)
        || input.session.completedAt !== input.request.completedAt
        || JSON.stringify(input.session.request) !== JSON.stringify(input.request)) {
        throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: 'Invalid completed SSR authority' })
      }
      const prior = registry.list().find(session => session.sessionId === input.session.sessionId)
      if (prior && (prior.kind !== 'ssr' || (prior.connected && !sameRpcPeer(registry.get(prior.sessionId).owner!.session, owner))))
        throw new DevtoolsError({ code: 'STALE_TARGET', message: 'SSR worker does not own this session' })
      const sections = [input, ...input.additionalStores ?? []]
      /** Encode exact authority without collisions from arbitrary public IDs. */
      const identity = (target: Target) => JSON.stringify([target.sessionId, target.storeId, target.generation])
      const advertised = new Set(input.session.stores.map(store => identity(store.target)))
      const captured = new Set(sections.map(section => identity(section.target)))
      // Failed requests may have no store and retain their legacy placeholder.
      // Every actual advertised store must otherwise have exactly one section.
      if (captured.size !== sections.length || advertised.size !== input.session.stores.length
        || (advertised.size ? captured.size !== advertised.size || [...captured].some(key => !advertised.has(key)) : sections.length !== 1)) {
        throw new DevtoolsError({ code: 'STALE_TARGET', message: 'SSR capture target differs from advertised stores' })
      }
      for (const section of sections) {
        const replies = Object.entries(section.views).flatMap(([view, data]) => view === 'cache' ? Object.values(data ?? {}) : [data])
        if (replies.some(reply => reply && identity(reply.target) !== identity(section.target)))
          throw new DevtoolsError({ code: 'STALE_TARGET', message: 'SSR capture view target differs from request' })
      }
      retention.add(input)
      prune()
      const snapshot = retention.get(input.session.sessionId)
      if (!snapshot)
        return
      const id = snapshot.session.sessionId
      // The registry keeps selectors and an ID reader, never a second retained DTO.
      registry.retain(snapshot.session, (request) => {
        const record = retention.get(id)
        if (!record)
          throw new DevtoolsError({ code: 'TARGET_NOT_FOUND', message: 'SSR snapshot expired' })
        return readSSRSnapshot(record, request)
      })
      published.add(snapshot.session.sessionId)
      broadcastInvalidation(context, { view: 'registry', revision: Date.now() })
    },
  })
  return () => {
    if (disposed)
      return
    disposed = true
    clearInterval(timer)
    for (const id of published)
      registry.remove(id)
    published.clear()
    retention.dispose()
  }
}
