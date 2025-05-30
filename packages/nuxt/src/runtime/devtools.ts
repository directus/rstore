import type { ResolvedModule } from '@rstore/shared'
import type { ShallowRef } from 'vue'

import type { StoreHistoryItem, StoreSubscriptionItem } from '../../client/utils/types'
import { useNuxtApp, useState } from '#app'
import { definePlugin } from '@rstore/vue'
import { createEventHook } from '@vueuse/core'
import { isRef, shallowRef, triggerRef, watch } from 'vue'

function useStoreStats() {
  return useState('$rstore-devtools-stats', () => ({
    history: [] as StoreHistoryItem[],
    subscriptions: [] as StoreSubscriptionItem[],
  }))
}

function convertFunctionsToString(obj: Record<string, any> | undefined) {
  if (!obj) {
    return obj
  }
  const result: Record<string, any> = {}
  for (const key in obj) {
    if (typeof obj[key] === 'function') {
      result[key] = obj[key].toString()
    }
    else {
      result[key] = obj[key]
    }
  }
  return result
}

export const devtoolsPlugin = definePlugin({
  name: 'rstore-devtools',

  meta: {
    builtin: true,
    description: 'Integrate with Nuxt Devtools',
  },

  setup({ hook }) {
    const storeStats = useStoreStats()

    const nuxtApp = useNuxtApp()

    // Cache

    if (import.meta.client) {
      const cacheUpdated = nuxtApp.$rstoreCacheUpdated = createEventHook()
      hook('afterCacheWrite', () => {
        cacheUpdated.trigger()
      })
      hook('afterCacheReset', () => {
        cacheUpdated.trigger()
      })
    }

    // History

    nuxtApp.$rstoreDevtoolsStats = () => storeStats.value

    const historyUpdated = nuxtApp.$rstoreHistoryUpdated = createEventHook()

    nuxtApp.$rstoreDevtoolsStatsClear = () => {
      storeStats.value.history = []
      historyUpdated.trigger()
    }

    hook('beforeFetch', (payload) => {
      payload.meta.storeHistoryItem = {
        started: new Date(),
      }
    })

    hook('afterFetch', (payload) => {
      if (payload.meta.storeHistoryItem) {
        storeStats.value.history.push({
          operation: payload.many ? 'fetchMany' : 'fetchFirst',
          model: payload.model.name,
          started: payload.meta.storeHistoryItem.started,
          ended: new Date(),
          result: payload.getResult(),
          key: payload.key,
          findOptions: convertFunctionsToString(payload.findOptions),
          server: import.meta.server,
        })
        historyUpdated.trigger()
      }
    })

    hook('beforeMutation', (payload) => {
      payload.meta.storeHistoryItem = {
        started: new Date(),
      }
    })

    hook('afterMutation', (payload) => {
      if (payload.meta.storeHistoryItem) {
        storeStats.value.history.push({
          operation: payload.mutation,
          model: payload.model.name,
          started: payload.meta.storeHistoryItem.started,
          ended: new Date(),
          result: payload.getResult(),
          key: payload.key,
          item: payload.item,
          server: import.meta.server,
        })
        historyUpdated.trigger()
      }
    })

    hook('afterCacheWrite', (payload) => {
      storeStats.value.history.push({
        operation: 'cacheWrite',
        model: payload.model.name,
        ended: new Date(),
        result: payload.result,
        key: payload.key,
        server: import.meta.server,
      })
      historyUpdated.trigger()
    })

    // Subscriptions

    const subscriptionsUpdated = nuxtApp.$rstoreSubscriptionsUpdated = createEventHook()

    hook('subscribe', (payload) => {
      storeStats.value.subscriptions.push({
        id: payload.subscriptionId,
        model: payload.model.name,
        key: payload.key,
        findOptions: convertFunctionsToString(payload.findOptions),
        started: new Date(),
      })
      subscriptionsUpdated.trigger()
    })

    hook('unsubscribe', (payload) => {
      const index = storeStats.value.subscriptions.findIndex(item => item.id === payload.subscriptionId)
      if (index !== -1) {
        storeStats.value.subscriptions.splice(index, 1)
        subscriptionsUpdated.trigger()
      }
    })

    // Modules

    if (import.meta.client) {
      const modulesUpdated = nuxtApp.$rstoreModulesUpdated = createEventHook()

      let modules: ShallowRef<Map<string, ResolvedModule<any, any>>> | undefined

      hook('init', (payload) => {
        modules = shallowRef(payload.store.$registeredModules)

        watch(() => {
          const result: Record<string, any> = {}
          for (const [moduleName, module] of modules!.value.entries()) {
            const m = result[moduleName] = {
              state: module.$state,
            } as Record<string, any>
            for (const key in module) {
              if (key.startsWith('$')) {
                continue
              }
              const value = module[key]
              // Register reactivity dependencies on mutation refs
              if (value?.__brand === 'rstore-module-mutation') {
                m[key] = {
                  $loading: value.$loading.value,
                  $error: value.$error.value,
                }
              }
              else if (value?.data && isRef(value.data) && value?.loading && isRef(value.loading) && value?.error && isRef(value.error)) {
                m[key] = {
                  data: value.data.value,
                  loading: value.loading.value,
                  error: value.error.value,
                }
              }
              else if (isRef(value)) {
                m[key] = value.value
              }
              else {
                m[key] = value
              }
            }
          }
          return result
        }, () => {
          modulesUpdated.trigger()
        }, {
          deep: true,
        })
      })

      hook('moduleResolved', (payload) => {
        modulesUpdated.trigger()
        if (modules) {
          modules.value = payload.store.$registeredModules
          triggerRef(modules)
        }
      })
    }
  },
})

declare module '@rstore/vue' {
  export interface CustomHookMeta {
    storeHistoryItem?: Pick<StoreHistoryItem, 'started'>
  }
}
