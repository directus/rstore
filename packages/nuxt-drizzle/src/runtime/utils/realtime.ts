import type { RstoreDrizzleRealtimePayload } from '../server/utils/hooks'
import type { RstoreDrizzleCondition } from './types'

export interface SubscriptionMessage {
  action: 'subscribe' | 'unsubscribe'
  collection: string
  key?: string | number
  where?: RstoreDrizzleCondition
}

export type SubscriptionUpdateMessage = RstoreDrizzleRealtimePayload<any>

export function getSubscriptionId(message: SubscriptionMessage) {
  return [
    message.collection,
    message.key ?? '*',
    message.where ? JSON.stringify(message.where) : '*',
  ].join('|')
}
