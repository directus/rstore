import type { Cache } from '@rstore/shared'
import { defaultManyMarker } from '@rstore/core'
import { ref } from 'vue'

export function createCache(): Cache {
  const state = ref<Record<string, any>>({})

  // @TODO Tracked item proxy + relation resolving

  return {
    readItem(type, key) {
      return state.value[type.name]?.[key]
    },
    readItems(type, marker) {
      if (!state.value._markers?.[marker]) {
        return []
      }
      return Object.values(state.value[type.name] ?? {})
    },
    writeItem(type, key, item) {
      let typeItems = state.value[type.name]
      if (!typeItems) {
        typeItems = state.value[type.name] = {}
      }
      if (!typeItems[key]) {
        typeItems[key] = item
      }
      else {
        Object.assign(typeItems[key], item)
      }
    },
    writeItems(type, items, marker) {
      let count = 0
      for (const { key, value } of items) {
        this.writeItem(type, key, value)
        count++
      }
      if (count > 0) {
        if (!state.value._markers) {
          state.value._markers = {}
        }
        state.value._markers[marker] = true
      }
    },
    getState() {
      return state.value
    },
    setState(value) {
      state.value = value
    },
    clear() {
      state.value = {}
    },
  }
}
