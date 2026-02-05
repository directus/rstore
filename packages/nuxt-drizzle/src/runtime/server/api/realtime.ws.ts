import type { SubscriptionMessage } from '../../utils/realtime'
// @ts-expect-error virtual file
import { dialect } from '$rstore-drizzle-server-utils.js'
import { defineWebSocketHandler } from 'h3'
import { getSubscriptionId } from '../../utils/realtime'
import { filterWhere } from '../../where'
import { rstoreDrizzleHooks } from '../utils/hooks'
import { usePeerPubSub } from '../utils/pubsub'

const subscriptions: Map<string, Map<string, () => void>> = new Map()

export default defineWebSocketHandler({
  message(peer, message) {
    if (message.text() === 'ping') {
      peer.send('pong')
    }
    else {
      const messageData = message.json() as { subscription?: SubscriptionMessage }
      if (messageData.subscription) {
        const { subscription } = messageData
        const subscriptionId = getSubscriptionId(messageData.subscription)
        if (!subscriptions.has(peer.id)) {
          subscriptions.set(peer.id, new Map())
        }
        const peerSubscriptions = subscriptions.get(peer.id)!
        if (subscription.action === 'subscribe') {
          if (!peerSubscriptions.has(subscriptionId)) {
            const pubsub = usePeerPubSub(peer.id)
            const off = pubsub.subscribe('update', async (payload) => {
              // TODO skip if same "client id" to prevent sending the message back to the sender of the mutation
              if (payload.collection === subscription.collection) {
                if (subscription.key != null && payload.key !== subscription.key) {
                  return
                }

                if (subscription.where && !filterWhere(payload.record, subscription.where, dialect)) {
                  return
                }

                let rejected = false
                await rstoreDrizzleHooks.callHook('realtime.filter', {
                  collection: payload.collection,
                  record: payload.record,
                  key: payload.key,
                  type: payload.type,
                  peer,
                  reject: () => {
                    rejected = true
                  },
                })
                if (rejected) {
                  return
                }

                peer.send({
                  update: payload,
                })
              }
            })
            peerSubscriptions.set(subscriptionId, off)
          }
        }
        else if (subscription.action === 'unsubscribe') {
          const off = peerSubscriptions.get(subscriptionId)
          if (off) {
            off()
            peerSubscriptions.delete(subscriptionId)
          }
        }
      }
    }
  },

  close(peer) {
    const pubsub = usePeerPubSub(peer.id)
    pubsub.unsubscribeAll()
  },

  error(peer, error) {
    console.error('[ws] error', peer, error)
  },
})
