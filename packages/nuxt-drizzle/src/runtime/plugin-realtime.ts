import type { SubscriptionMessage, SubscriptionUpdateMessage } from './utils/realtime'
// @ts-expect-error virtual module
import { wsApiPath } from '#build/$rstore-drizzle-config.js'
import { definePlugin } from '@rstore/vue'
import { useWebSocket } from '@vueuse/core'
import { watch } from 'vue'
import { getSubscriptionId } from './utils/realtime'

export default definePlugin({
  name: 'rstore-drizzle-realtime',

  category: 'remote',

  // @TODO multi drizzle instances
  scopeId: 'rstore-drizzle',

  setup({ hook }) {
    if (import.meta.client) {
      const countPerTopic: Record<string, number> = {}
      const messages = new Map<string, SubscriptionMessage>()

      const ws = useWebSocket(wsApiPath, {
        heartbeat: {
          interval: 10000,
        },
        autoReconnect: true,
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
        countPerTopic[subscriptionId] ??= 1
        countPerTopic[subscriptionId]--
        if (countPerTopic[subscriptionId] === 0) {
          ws.send(JSON.stringify({
            subscription: message,
          }), false)
          messages.delete(subscriptionId)
        }
      })

      hook('init', ({ store }) => {
        watch(ws.data, async (data: string) => {
          if (data === 'pong') {
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
        if (status === 'CLOSED') {
          // Reset counts on reconnect
          for (const key in countPerTopic) {
            countPerTopic[key] = 0
          }
        }
        else if (status === 'OPEN') {
          // Resubscribe to all topics
          for (const [, message] of messages) {
            ws.send(JSON.stringify({
              subscription: message,
            }), false)
          }
        }
      })
    }
  },
})
