import type { CollabServerMessage } from '../protocol/collab.js'
import type { CollabSubscription, createSubscriptionRegistry } from './collabSubscriptions.js'
import type { CollabServerHooks } from './collabTypes.js'
import { sendTo } from './collabSubscriptions.js'

/** Dependencies for current-authority checks immediately before one peer receives a frame. */
export interface CollabDeliveryContext {
  hooks: CollabServerHooks
  subscriptions: ReturnType<typeof createSubscriptionRegistry>
}

/** Creates fail-closed, per-frame delivery for subscriptions that may have been revoked or closed. */
export function createCollabDelivery(context: CollabDeliveryContext) {
  const { hooks, subscriptions } = context

  /** Checks current receiver authorization and sends only if its subscription stayed bound while awaiting it. */
  async function send(subscription: CollabSubscription, frame: CollabServerMessage): Promise<boolean> {
    const peer = subscription.peer
    try {
      if (hooks.canDeliver && !(await hooks.canDeliver({ peer, docId: subscription.docId }))) {
        return false
      }
    }
    catch {
      return false
    }
    if (!subscriptions.isCurrent(subscription, peer)) {
      return false
    }
    try {
      sendTo(subscription, frame)
      return true
    }
    catch {
      subscriptions.remove(subscription, peer)
      return false
    }
  }

  return { send }
}
