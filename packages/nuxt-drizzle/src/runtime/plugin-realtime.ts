import type { SubscriptionMessage, SubscriptionUpdateMessage } from './utils/realtime'
// @ts-expect-error virtual module
import { wsAutoReconnect, wsClientEndpoint, wsHeartbeatInterval } from '#build/$rstore-drizzle-config.js'
import { definePlugin, realtimeReconnectEventHook } from '@rstore/vue'
import { useWebSocket } from '@vueuse/core'
import { watch } from 'vue'
import { getRstoreDrizzleClientId } from './utils/client-id'
import { getSubscriptionId } from './utils/realtime'

export default definePlugin({
  name: 'rstore-drizzle-realtime',

  category: 'remote',

  // @TODO multi drizzle instances
  scopeId: 'rstore-drizzle',

  setup({ hook }) {
    if (import.meta.client) {
      const clientId = getRstoreDrizzleClientId()

      // Local ref-count per subscription id — a given (collection, key, where)
      // is only sent to the server once, regardless of how many components
      // subscribe to it locally. The matching `unsubscribe` is only emitted
      // when the last subscriber is torn down.
      const countPerTopic: Record<string, number> = {}
      const messages = new Map<string, SubscriptionMessage>()

      const ws = useWebSocket(wsClientEndpoint, {
        heartbeat: {
          interval: wsHeartbeatInterval,
        },
        autoReconnect: wsAutoReconnect,
      })

      let connectCount = 0

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

      hook('init', ({ store }) => {
        watch(ws.data, async (data) => {
          if (typeof data !== 'string' || data === 'pong') {
            return
          }
          try {
            const message = JSON.parse(data) as { update?: SubscriptionUpdateMessage }
            if (message.update) {
              const collection = store.$collections.find(c => c.name === message.update!.collection)
              if (!collection) {
                throw new Error(`Collection ${message.update.collection} not found`)
              }
              switch (message.update.type) {
                case 'created':
                case 'updated': {
                  const key = collection.getKey(message.update.record)
                  if (key == null) {
                    throw new Error(`Key not found for collection ${collection.name}`)
                  }
                  store.$cache.writeItem({
                    collection,
                    key,
                    item: message.update.record,
                  })
                  break
                }
                case 'deleted': {
                  const key = message.update.key
                  if (key == null) {
                    throw new Error(`Key not found for collection ${collection.name}`)
                  }
                  store.$cache.deleteItem({
                    collection,
                    key,
                  })
                }
              }
            }
          }
          catch (e) {
            console.error('[Realtime] Failed to handle websocket message', e)
          }
        })
      })

      watch(ws.status, (status) => {
        if (status === 'OPEN') {
          connectCount++

          // Announce our clientId first so the server can tag us for
          // skip-self echo suppression before any mutation echoes arrive.
          if (clientId) {
            ws.send(JSON.stringify({ init: { clientId } }), false)
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
          }
        }
      })
    }
  },
})
