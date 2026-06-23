import type { ClientInitMessage, SubscriptionMessage } from '../../utils/realtime'
import { defineWebSocketHandler } from 'h3'
import { normalizeSubscriptionKey } from '../../utils/realtime'
import { handleSubscription } from './subscriptions'
import { getPeerState, peerStates } from './utils/peerState'
import { CLIENT_ID_HEADER, isSupportedClientVersion, rejectPeerVersion, sendInitAck } from './utils/protocol'

export { closeAllRstoreDrizzlePeers } from './utils/peerState'

export default defineWebSocketHandler({
  upgrade(request) {
    const clientId = request.headers.get(CLIENT_ID_HEADER)
    if (clientId) {
      (request.context as Record<string, unknown>).rstoreClientId = clientId
    }
  },

  open(peer) {
    const state = getPeerState(peer)
    const preBound = (peer.context as Record<string, unknown> | undefined)?.rstoreClientId
    if (typeof preBound === 'string' && !state.clientId) {
      state.clientId = preBound
      sendInitAck(peer, state)
    }
  },

  async message(peer, message) {
    const text = message.text()
    if (text === 'ping') {
      peer.send('pong')
      return
    }

    const data = readMessage(message)
    if (!data) {
      return
    }

    const state = getPeerState(peer)
    if (state.rejected) {
      return
    }

    if (data.init && typeof data.init.clientId === 'string') {
      if (!isSupportedClientVersion(data.init.v)) {
        rejectPeerVersion(peer, state, 'unsupported-version')
        return
      }
      state.clientId = data.init.clientId
      sendInitAck(peer, state)
      return
    }

    if (!data.subscription) {
      return
    }
    await handleSubscription(peer, state, normalizeSubscription(data.subscription))
  },

  close(peer) {
    const state = peerStates.get(peer.id)
    if (state?.off) {
      state.off()
    }
    peerStates.delete(peer.id)
  },

  error(peer, error) {
    console.error('[ws] error', peer, error)
  },
})

function readMessage(message: any): { subscription?: SubscriptionMessage, init?: ClientInitMessage } | undefined {
  try {
    return message.json()
  }
  catch {
    return undefined
  }
}

function normalizeSubscription(subscription: SubscriptionMessage): SubscriptionMessage {
  return {
    ...subscription,
    key: subscription.key != null ? normalizeSubscriptionKey(subscription.key) : undefined,
  }
}
