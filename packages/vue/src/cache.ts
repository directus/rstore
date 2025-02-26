import type { Cache } from '@rstore/shared'
import { ref } from 'vue'

export function createCache(): Cache {
  const state = ref<Record<string, any>>({})

  // @TODO Tracked item proxy + relation resolving

  function mark(marker: string) {
    if (!state.value._markers) {
      state.value._markers = {}
    }
    state.value._markers[marker] = true
  }

  return {
    readItem({ type, key }) {
      return state.value[type.name]?.[key]
    },
    readItems({ type, marker }) {
      if (!state.value._markers?.[marker]) {
        return []
      }
      return Object.values(state.value[type.name] ?? {})
    },
    writeItem({ type, key, item, marker }) {
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
      if (marker) {
        mark(marker)
      }
    },
    writeItems({ type, items, marker }) {
      for (const { key, value: item } of items) {
        this.writeItem({ type, key, item })
      }
      mark(marker)
    },
    deleteItem({ type, key }) {
      delete state.value[type.name]?.[key]
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
