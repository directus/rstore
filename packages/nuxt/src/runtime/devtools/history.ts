import { createEventHook } from '@vueuse/core'
import { markRaw } from 'vue'
import { convertFunctionsToString } from './stats'

/** Register devtools operation history tracking. */
export function installHistoryDevtoolsHooks(nuxtApp: any, hook: any, storeStats: any) {
  nuxtApp.$rstoreDevtoolsStats = () => storeStats.value
  const historyUpdated = nuxtApp.$rstoreHistoryUpdated = createEventHook<void>()

  nuxtApp.$rstoreDevtoolsStatsClear = () => {
    storeStats.value.history = []
    historyUpdated.trigger()
  }

  hook('beforeFetch', (payload: any) => {
    payload.meta.storeHistoryItem = { started: new Date() }
  })
  hook('afterFetch', (payload: any) => {
    if (!payload.meta.storeHistoryItem) {
      return
    }
    storeStats.value.history.push(markRaw({
      operation: payload.many ? 'fetchMany' : 'fetchFirst',
      collection: payload.collection.name,
      started: payload.meta.storeHistoryItem.started,
      ended: new Date(),
      result: payload.getResult(),
      key: payload.key,
      findOptions: convertFunctionsToString(payload.findOptions),
      server: import.meta.server,
    }))
    historyUpdated.trigger()
  })

  installMutationHistory(hook, storeStats, historyUpdated)
  installCacheHistory(hook, storeStats, historyUpdated)
}

function installMutationHistory(hook: any, storeStats: any, historyUpdated: any) {
  hook('beforeMutation', (payload: any) => {
    payload.meta.storeHistoryItem = { started: new Date() }
  })
  hook('afterMutation', (payload: any) => {
    if (!payload.meta.storeHistoryItem) {
      return
    }
    storeStats.value.history.push(markRaw({
      operation: payload.mutation,
      collection: payload.collection.name,
      started: payload.meta.storeHistoryItem.started,
      ended: new Date(),
      result: payload.getResult(),
      key: payload.key,
      item: payload.item,
      server: import.meta.server,
    }))
    historyUpdated.trigger()
  })
}

function installCacheHistory(hook: any, storeStats: any, historyUpdated: any) {
  hook('afterCacheWrite', (payload: any) => {
    storeStats.value.history.push(markRaw({
      operation: 'cacheWrite',
      collection: payload.collection.name,
      ended: new Date(),
      result: payload.result,
      key: payload.key,
      server: import.meta.server,
    }))
    historyUpdated.trigger()
  })
  hook('itemGarbageCollect', (payload: any) => {
    storeStats.value.history.push(markRaw({
      operation: 'itemGarbageCollect',
      collection: payload.collection.name,
      ended: new Date(),
      key: payload.key,
      result: payload.item,
    }))
    historyUpdated.trigger()
  })
  for (const name of ['cacheLayerAdd', 'cacheLayerRemove'] as const) {
    hook(name, (payload: any) => {
      storeStats.value.history.push(markRaw({
        operation: name,
        result: payload.layer,
        ended: new Date(),
      }))
      historyUpdated.trigger()
    })
  }
}
