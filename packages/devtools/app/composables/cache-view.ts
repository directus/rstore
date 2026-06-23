import type { ResolvedCollection } from '@rstore/shared'
import { useLocalStorage } from '@vueuse/core'
import { computed, reactive, ref, watch } from 'vue'
import { useStoreCache } from './cache'
import { useNonNullRstore } from './rstore'

export type CacheRow
  = | { id: string, type: 'deleted-header', count: number }
    | { id: string, type: 'deleted-item', deletedItem: string | number }
    | { id: string, type: 'cache-item', key: string, value: any }

/** Create reactive state and actions for the devtools cache view. */
export function useCacheView() {
  const store = useNonNullRstore()
  const { cache, layers } = useStoreCache()
  const itemSearchContent = ref('')
  const itemSearchTempContent = ref('')
  const forceUpdate = ref(0)
  const showRawCache = useLocalStorage('rstore-devtools-show-raw-cache', false)
  const selectedCollection = useLocalStorage<string | null>('rstore-devtools-selected-cache-collection', null)
  const cacheCollectionSearch = useLocalStorage('rstore-devtools-cache-collection-search', '')
  const itemSearchKey = useLocalStorage('rstore-devtools-cache-item-search-key', '')
  const selectedLayerId = ref<string | undefined>()
  const keySearchOptions = ref<string[]>([])

  const selectedLayer = computed(() => layers.value.find(layer => layer.id === selectedLayerId.value))
  const selectedCache = computed(() => getSelectedCache())
  const deletedItemsFromLayer = computed(() => getDeletedItemsFromLayer())
  const filteredCollections = computed(() => getFilteredCollections())
  const filteredCache = computed(() => filterCache(selectedCache.value))
  const cacheRows = computed(() => getCacheRows(filteredCache.value, deletedItemsFromLayer.value))
  const hasSelectedCollectionItems = computed(() => {
    return Boolean(Object.keys(selectedCache.value ?? {}).length || deletedItemsFromLayer.value?.size)
  })

  watch(cache, () => {
    forceUpdate.value++
  })

  watch(selectedCollection, () => {
    itemSearchKey.value = ''
    itemSearchContent.value = ''
    itemSearchTempContent.value = ''
  })

  function getFilteredCollections(): Array<ResolvedCollection> {
    const search = cacheCollectionSearch.value.toLowerCase()
    const result = search
      ? store.value.$collections.filter(collection => collection.name.toLowerCase().includes(search))
      : store.value.$collections
    return [...result].sort((a, b) => a.name.localeCompare(b.name))
  }

  function getSelectedCache() {
    if (selectedLayer.value) {
      return selectedLayer.value.state as Record<string, any>
    }
    if (!selectedCollection.value) {
      return {}
    }
    return cache.value.collections[selectedCollection.value as keyof typeof cache.value.collections] as Record<string, any> ?? {}
  }

  function getDeletedItemsFromLayer() {
    const layer = selectedLayer.value
    return layer?.collectionName === selectedCollection.value && layer.deletedItems.size
      ? layer.deletedItems
      : null
  }

  function filterCache(collectionCache: Record<string, any> | undefined) {
    // eslint-disable-next-line ts/no-unused-expressions
    forceUpdate.value
    let result = filterByKey(collectionCache)
    result = filterByContent(result)
    return result
  }

  function filterByKey(collectionCache: Record<string, any> | undefined) {
    if (!itemSearchKey.value || !collectionCache) {
      return collectionCache
    }
    const result: Record<string, string> = {}
    for (const key in collectionCache) {
      if (key.includes(itemSearchKey.value)) {
        result[key] = collectionCache[key]
      }
    }
    return result
  }

  function filterByContent(collectionCache: Record<string, any> | undefined) {
    if (!itemSearchContent.value || !collectionCache) {
      return collectionCache
    }
    try {
      // eslint-disable-next-line no-eval
      const filter = eval(`(item) => {
        return ${itemSearchContent.value}
      }`)
      const result: Record<string, string> = {}
      for (const key in collectionCache) {
        if (filter(collectionCache[key])) {
          result[key] = collectionCache[key]
        }
      }
      return result
    }
    catch (error) {
      console.warn(`[rstore devtools] Invalid filter: ${itemSearchContent.value}`)
      console.warn(error)
      return collectionCache
    }
  }

  function getCacheRows(collectionCache: Record<string, any> | undefined, deletedItems: Set<string | number> | null): CacheRow[] {
    const rows: CacheRow[] = []
    if (deletedItems?.size) {
      rows.push({ id: 'deleted-header', type: 'deleted-header', count: deletedItems.size })
      for (const deletedItem of deletedItems) {
        rows.push({ id: `deleted-${String(deletedItem)}`, type: 'deleted-item', deletedItem })
      }
    }
    for (const [key, value] of Object.entries(collectionCache ?? {})) {
      rows.push({ id: `item-${key}`, type: 'cache-item', key, value })
    }
    return rows
  }

  function updateKeySearchOptions() {
    keySearchOptions.value = Object.keys(selectedCache.value || {})
  }

  function setShowRawCache(value: boolean) {
    showRawCache.value = value
  }

  function setCacheCollectionSearch(value: string) {
    cacheCollectionSearch.value = value
  }

  function setSelectedLayerId(value: string | undefined) {
    selectedLayerId.value = value
  }

  function setItemSearchKey(value: string) {
    itemSearchKey.value = value
  }

  function setItemSearchContent(value: string) {
    itemSearchContent.value = value
  }

  function setItemSearchTempContent(value: string) {
    itemSearchTempContent.value = value
  }

  function isSelectedCollection(collectionName: string) {
    return selectedCollection.value === collectionName
  }

  function selectCollection(collectionName: string) {
    selectedCollection.value = collectionName
  }

  function collectionState(collectionName: string) {
    return selectedLayer.value?.collectionName === collectionName
      ? { [collectionName]: selectedLayer.value.state }
      : cache.value.collections
  }

  function collectionSelectedLayer(collectionName: string) {
    return selectedLayer.value?.collectionName === collectionName
      ? selectedLayer.value
      : undefined
  }

  function clearItemSearchKey() {
    itemSearchKey.value = ''
  }

  return reactive({
    store,
    cache,
    layers,
    itemSearchContent,
    itemSearchTempContent,
    forceUpdate,
    showRawCache,
    selectedCollection,
    cacheCollectionSearch,
    itemSearchKey,
    selectedLayerId,
    selectedLayer,
    selectedCache,
    deletedItemsFromLayer,
    filteredCollections,
    cacheRows,
    hasSelectedCollectionItems,
    keySearchOptions,
    updateKeySearchOptions,
    setShowRawCache,
    setCacheCollectionSearch,
    setSelectedLayerId,
    setItemSearchKey,
    setItemSearchContent,
    setItemSearchTempContent,
    isSelectedCollection,
    selectCollection,
    collectionState,
    collectionSelectedLayer,
    clearItemSearchKey,
  })
}
