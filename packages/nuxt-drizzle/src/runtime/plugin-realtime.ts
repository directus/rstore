import type { FieldTimestampValue } from '@rstore/shared'
import type { InitAckMessage, InitErrorMessage, SubscriptionMessage, SubscriptionRejectedMessage, SubscriptionUpdateMessage } from './utils/realtime'
// @ts-expect-error virtual module
import { scopeId as drizzleScopeId, wsAutoReconnect, wsClientEndpoint, wsHeartbeatInterval } from '#build/$rstore-drizzle-config.js'
import { compareHLC } from '@rstore/core'
import { definePlugin, realtimeReconnectEventHook } from '@rstore/vue'
import { useWebSocket } from '@vueuse/core'
import { watch } from 'vue'
import { getRstoreDrizzleClientId } from './utils/client-id'
import { getSubscriptionId, RSTORE_DRIZZLE_PROTOCOL_VERSION } from './utils/realtime'
import { maxPayloadStamp, stampToDate } from './utils/realtime-stamps'

export default definePlugin({
  name: 'rstore-drizzle-realtime',

  category: 'remote',

  scopeId: drizzleScopeId,

  setup({ hook }) {
    if (import.meta.client) {
      const clientId = getRstoreDrizzleClientId()

      // Local ref-count per subscription id — a given (collection, key, where)
      // is only sent to the server once, regardless of how many components
      // subscribe to it locally. The matching `unsubscribe` is only emitted
      // when the last subscriber is torn down.
      const countPerTopic: Record<string, number> = {}
      const messages = new Map<string, SubscriptionMessage>()
      // Highest HLC seen per collection. Used as `lastUpdatedAt` for the
      // `syncCollection` hook on reconnect so only missed rows flow back.
      const lastStampPerCollection = new Map<string, FieldTimestampValue>()

      const ws = useWebSocket(wsClientEndpoint, {
        heartbeat: {
          interval: wsHeartbeatInterval,
        },
        autoReconnect: wsAutoReconnect,
      })

      let connectCount = 0
      // `awaitRealtimeReady()` resolves once the server has ack'd the init
      // frame (or bound our clientId from the upgrade header). Mutations
      // issued via `beforeMutation` await this so our own echoes are
      // reliably suppressed for the originating tab.
      let readyResolve: (() => void) | undefined
      let readyPromise = new Promise<void>((resolve) => {
        readyResolve = resolve
      })
      function resetReady() {
        readyPromise = new Promise<void>((resolve) => {
          readyResolve = resolve
        })
      }
      function markReady() {
        readyResolve?.()
      }
      function awaitRealtimeReady() {
        return readyPromise
      }

      hook('beforeMutation', async () => {
        // Block mutations until we know the server has our clientId.
        await awaitRealtimeReady()
      })

      hook('subscribe', ({ collection, key, findOptions }) => {
        const where = findOptions?.where
        const message: SubscriptionMessage = {
          action: 'subscribe',
          collection: collection.name,
          key,
          where,
        }
        const subscriptionId = getSubscriptionId(message)
        countPerTopic[subscriptionId] ??= 0
        if (countPerTopic[subscriptionId] === 0) {
          ws.send(JSON.stringify({
            subscription: message,
          }), false)
          messages.set(subscriptionId, message)
        }
        countPerTopic[subscriptionId]++
      })

      hook('unsubscribe', ({ collection, key, findOptions }) => {
        const where = findOptions?.where
        const message: SubscriptionMessage = {
          action: 'unsubscribe',
          collection: collection.name,
          key,
          where,
        }
        const subscriptionId = getSubscriptionId(message)
        const current = countPerTopic[subscriptionId] ?? 0
        // Guard against decrementing below zero — a stray unsubscribe without
        // a matching subscribe would otherwise send a spurious unsubscribe
        // frame and corrupt the counter.
        if (current <= 0) {
          return
        }
        countPerTopic[subscriptionId] = current - 1
        if (countPerTopic[subscriptionId] === 0) {
          ws.send(JSON.stringify({
            subscription: message,
          }), false)
          messages.delete(subscriptionId)
        }
      })

      let storeRef: any = null

      hook('init', ({ store }) => {
        storeRef = store

        function applyUpdate(u: SubscriptionUpdateMessage) {
          const collection = store.$collections.find(c => c.name === u.collection)
          if (!collection) {
            throw new Error(`Collection ${u.collection} not found`)
          }

          const stamp = maxPayloadStamp(u)
          if (stamp !== undefined) {
            const prev = lastStampPerCollection.get(collection.name)
            if (prev === undefined || compareHLC(stamp, prev) > 0) {
              lastStampPerCollection.set(collection.name, stamp)
            }
          }

          switch (u.type) {
            case 'created':
            case 'updated': {
              const key = collection.getKey(u.record)
              if (key == null) {
                throw new Error(`Key not found for collection ${collection.name}`)
              }
              store.$cache.writeItem({
                collection,
                key,
                item: u.record,
                fieldTimestamps: u.fieldTimestamps,
              })
              break
            }
            case 'deleted': {
              const key = u.key
              if (key == null) {
                throw new Error(`Key not found for collection ${collection.name}`)
              }
              store.$cache.deleteItem({
                collection,
                key,
                deletedAt: u.deletedAt,
              })
            }
          }
        }

        watch(ws.data, async (data) => {
          if (typeof data !== 'string' || data === 'pong') {
            return
          }
          try {
            const message = JSON.parse(data) as {
              update?: SubscriptionUpdateMessage
              updates?: SubscriptionUpdateMessage[]
              init?: InitAckMessage | InitErrorMessage
              subscription?: SubscriptionRejectedMessage
            }
            if (message.init?.ok === true) {
              markReady()
              return
            }
            if (message.init && message.init.ok === false) {
              // Server refused the handshake (e.g. the client is too new
              // for this server). Surface a loud error and stop trying
              // to reconnect — auto-retrying would just loop forever.
              console.error(
                '[Realtime] Server rejected handshake:',
                message.init.error,
                `(server v=${message.init.v}, client v=${RSTORE_DRIZZLE_PROTOCOL_VERSION})`,
              )
              ws.close()
              return
            }
            if (message.subscription?.action === 'rejected') {
              console.warn(
                '[Realtime] Subscription rejected by server',
                message.subscription.collection,
                message.subscription.reason,
              )
              return
            }

            // Fan-out a batched `{ updates: [...] }` frame back through the
            // same single-update handler used for legacy `{ update }` frames.
            if (Array.isArray(message.updates)) {
              for (const u of message.updates) {
                applyUpdate(u)
              }
              return
            }
            if (message.update) {
              applyUpdate(message.update)
            }
          }
          catch (e) {
            console.error('[Realtime] Failed to handle websocket message', e)
          }
        })
      })

      async function runSyncCollections() {
        const store = storeRef
        if (!store) {
          return
        }
        const seen = new Set<string>()
        for (const [, msg] of messages) {
          if (seen.has(msg.collection)) {
            continue
          }
          seen.add(msg.collection)
          const collection = store.$collections.find((c: any) => c.name === msg.collection)
          if (!collection) {
            continue
          }
          const stamp = lastStampPerCollection.get(msg.collection)
          await store.$hooks.callHook('syncCollection', {
            store,
            meta: {},
            collection,
            lastUpdatedAt: stamp !== undefined ? stampToDate(stamp) : undefined,
            loadedItems: () => [],
            storeItems: (items: any[]) => {
              for (const item of items) {
                const key = collection.getKey(item)
                if (key != null) {
                  store.$cache.writeItem({ collection, key, item })
                }
              }
            },
            deleteItems: (keys: Array<string | number>) => {
              for (const key of keys) {
                store.$cache.deleteItem({ collection, key })
              }
            },
          })
        }
      }

      watch(ws.status, (status) => {
        if (status !== 'OPEN') {
          // Any drop (CLOSED/CONNECTING) re-arms readiness so mutations
          // issued before the next init-ack hold until the server
          // re-registers our clientId.
          if (status === 'CLOSED' || status === 'CONNECTING') {
            resetReady()
          }
          return
        }

        connectCount++

        // Announce our clientId first so the server can tag us for
        // skip-self echo suppression before any mutation echoes arrive.
        if (clientId) {
          ws.send(JSON.stringify({
            init: { clientId, v: RSTORE_DRIZZLE_PROTOCOL_VERSION },
          }), false)
        }

        // Resubscribe to all active topics. On first open this replays
        // subscriptions issued while CONNECTING; on reconnect it restores
        // subscriptions across a transient disconnect.
        for (const [, message] of messages) {
          ws.send(JSON.stringify({
            subscription: message,
          }), false)
        }

        // Notify live queries to refresh so updates missed while offline
        // are recovered. Only fire on true reconnects (skip first open).
        if (connectCount > 1) {
          realtimeReconnectEventHook.trigger()

          // Fire `syncCollection` per active collection so any plugin that
          // can do a delta fetch (drizzle REST + updated_at filter, offline
          // snapshot, etc.) gets a chance to backfill missed rows.
          void runSyncCollections()
        }
      })
    }
  },
})
