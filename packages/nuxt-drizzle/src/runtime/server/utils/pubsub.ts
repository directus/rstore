import type { RstoreDrizzleRealtimePayload } from './hooks'

interface PubSub<TChannels> {
  subscribe: <K extends Extract<keyof TChannels, string>>(
    channel: K,
    callback: (payload: TChannels[K]) => void,
  ) => () => void

  publish: <K extends Extract<keyof TChannels, string>>(
    channel: K,
    payload: TChannels[K],
  ) => void
}

export interface RstoreDrizzlePubSubChannels {
  update: RstoreDrizzleRealtimePayload<any>
}

export type RstoreDrizzlePubSub = PubSub<RstoreDrizzlePubSubChannels>

function createMemoryPubSub(): RstoreDrizzlePubSub {
  const subscribers: {
    [K in keyof RstoreDrizzlePubSubChannels]?: Array<(payload: RstoreDrizzlePubSubChannels[K]) => void>
  } = {}

  return {
    subscribe(channel, callback) {
      let callbacks = subscribers[channel]
      if (!callbacks) {
        callbacks = []
        subscribers[channel] = callbacks
      }
      callbacks.push(callback)
      return () => {
        const index = callbacks!.indexOf(callback)
        if (index !== -1) {
          callbacks!.splice(index, 1)
        }
      }
    },
    publish(channel, payload) {
      const callbacks = subscribers[channel]
      if (callbacks) {
        for (const callback of callbacks) {
          callback(payload)
        }
      }
    },
  }
}

let pubsubInstance: RstoreDrizzlePubSub = createMemoryPubSub()

export function getPubSub(): RstoreDrizzlePubSub {
  return pubsubInstance
}

export function setPubSub(pubsub: RstoreDrizzlePubSub) {
  pubsubInstance = pubsub
}

const peers = new Map<string, Record<string, Array<() => void>>>()

export function usePeerPubSub(peerId: string) {
  const publish: typeof pubsubInstance.publish = (channel, payload) => {
    getPubSub().publish(channel, payload)
  }

  const subscribe: typeof pubsubInstance.subscribe = (channel, callback) => {
    const off = getPubSub().subscribe(channel, callback)
    let peerSubscriptions = peers.get(peerId)
    if (!peerSubscriptions) {
      peerSubscriptions = {}
      peers.set(peerId, peerSubscriptions)
    }
    let channelSubscriptions = peerSubscriptions[channel]
    if (!channelSubscriptions) {
      channelSubscriptions = []
      peerSubscriptions[channel] = channelSubscriptions
    }
    channelSubscriptions.push(off)
    return off
  }

  function unsubscribeAll() {
    const peerSubscriptions = peers.get(peerId) || {}
    for (const channel in peerSubscriptions) {
      const channelSubscriptions = peerSubscriptions[channel] || []
      for (const off of channelSubscriptions) {
        off()
      }
    }
    peers.delete(peerId)
  }

  return {
    publish,
    subscribe,
    unsubscribeAll,
  }
}
