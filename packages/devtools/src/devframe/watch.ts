import type { DevframeNodeContext, DevframeNodeRpcSession } from 'devframe'
import type { RstoreDevtools } from '../runtime/types'
import type { ProducerRegistry } from './producer-registry'
import * as v from 'valibot'
import { DevtoolsError, WatchRequestSchema } from '../protocol'
import { sameRpcPeer } from './producer-registry'

/** Shared schema also validates client-side owner requests. */
export const WatchSchema = WatchRequestSchema
/** Pending and settled observations both consume bounded viewer quota. */
interface WatchLease {
  /** Session remains independently detachable while producer socket stays open. */
  sessionId: string
  /** Stable viewer peer releasing this lease. */
  viewer: DevframeNodeRpcSession
  /** Remote producer peer, cleared when its connection ends. */
  producerId?: number
  /** Release actual runtime observation, not only metadata. */
  stop: () => void | Promise<void>
}
/** Remote viewer leases own Core polling/Vue watchers while selected view remains open. */
export function registerWatchHandlers(context: DevframeNodeContext, registry: ProducerRegistry, runtime?: RstoreDevtools) {
  const leases = new Map<string, WatchLease>()
  context.rpc.register({
    name: 'rstore:watch',
    type: 'action',
    jsonSerializable: true,
    args: [WatchSchema],
    async handler(input: v.InferOutput<typeof WatchSchema>) {
      const viewer = context.rpc.getCurrentRpcSession()
      if (!viewer?.meta.isTrusted)
        throw new DevtoolsError({ code: 'READ_ONLY', message: 'Authenticated viewer required' })
      if ([...leases.values()].filter(lease => sameRpcPeer(lease.viewer, viewer)).length >= 100)
        throw new DevtoolsError({ code: 'CAPACITY', message: 'Viewer observation capacity exceeded' })
      const watchId = crypto.randomUUID()
      const lease: WatchLease = { viewer, sessionId: input.target.sessionId, stop: () => {} }
      // Reserve before first await so concurrent calls cannot bypass capacity.
      leases.set(watchId, lease)
      try {
        if (runtime && runtime.session.sessionId === input.target.sessionId) {
          lease.stop = runtime.subscribe(() => {}, input.target, input.view)
        }
        else {
          const record = registry.get(input.target.sessionId)
          if (record.read) {
            leases.delete(watchId)
            return { watchId: '' }
          }
          const owner = record.owner!
          const call = owner.session.rpc.$call as (method: string, ...args: unknown[]) => Promise<unknown>
          lease.producerId = owner.session.meta.id
          lease.stop = () => call('rstore:producer-unwatch', { watchId }).then(() => undefined).catch(() => {})
          await call('rstore:producer-watch', { ...input, watchId })
          if (!registry.isCurrent(input.target.sessionId, owner))
            throw new DevtoolsError({ code: 'STALE_TARGET', message: 'Producer replaced during subscription' })
        }
        if (viewer.rpc.$closed || !leases.has(watchId))
          throw new DevtoolsError({ code: 'UNAVAILABLE', message: 'Observation owner disconnected' })
        return { watchId }
      }
      catch (error) {
        leases.delete(watchId)
        await lease.stop()
        throw error
      }
    },
  })
  context.rpc.register({
    name: 'rstore:unwatch',
    type: 'action',
    jsonSerializable: true,
    args: [v.strictObject({ watchId: v.string() })],
    async handler({ watchId }: { watchId: string }) {
      const lease = leases.get(watchId)
      if (lease && sameRpcPeer(lease.viewer, context.rpc.getCurrentRpcSession())) {
        leases.delete(watchId)
        await lease.stop()
      }
    },
  })
  return {
    /** One worker request/runtime unregisters without closing other owned sessions. */
    detach(sessionId: string, producerId: number) {
      for (const [watchId, lease] of leases) {
        if (lease.sessionId === sessionId && lease.producerId === producerId) {
          leases.delete(watchId)
          void lease.stop()
        }
      }
    },
    /** Both viewer and producer disconnect remove handles, including pending leases. */
    disconnect(id: number) {
      for (const [watchId, lease] of leases) {
        if (lease.viewer.meta.id === id || lease.producerId === id) {
          leases.delete(watchId)
          void lease.stop()
        }
      }
    },
    /** Host closure releases every observation lease before clearing producers. */
    dispose() {
      for (const lease of leases.values()) void lease.stop()
      leases.clear()
    },
  }
}
