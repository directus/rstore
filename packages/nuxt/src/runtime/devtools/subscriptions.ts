import { createEventHook } from '@vueuse/core'
import { markRaw } from 'vue'
import { convertFunctionsToString } from './stats'

/** Register active subscription tracking for devtools. */
export function installSubscriptionDevtoolsHooks(nuxtApp: any, hook: any, storeStats: any) {
  const subscriptionsUpdated = nuxtApp.$rstoreSubscriptionsUpdated = createEventHook<void>()

  hook('subscribe', (payload: any) => {
    storeStats.value.subscriptions.push(markRaw({
      id: payload.subscriptionId,
      collection: payload.collection.name,
      key: payload.key,
      findOptions: convertFunctionsToString(payload.findOptions),
      started: new Date(),
    }))
    subscriptionsUpdated.trigger()
  })

  hook('unsubscribe', (payload: any) => {
    const index = storeStats.value.subscriptions.findIndex((item: any) => item.id === payload.subscriptionId)
    if (index !== -1) {
      storeStats.value.subscriptions.splice(index, 1)
      subscriptionsUpdated.trigger()
    }
  })
}
