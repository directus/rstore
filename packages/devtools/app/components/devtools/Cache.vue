<script lang="ts" setup>
import type { ResolvedCollection } from '@rstore/shared'

import { useLocalStorage } from '@vueuse/core'
import { computed, ref, useTemplateRef, watch } from 'vue'

import { useStoreCache } from '../../composables/cache'
import { useNonNullRstore } from '../../composables/rstore'
import CodeSnippet from '../CodeSnippet.vue'
import Empty from '../Empty.vue'
import DevtoolsCacheCollectionItem from './CacheCollectionItem.vue'
import DevtoolsVirtualList from './VirtualList.vue'

const store = useNonNullRstore()
const { cache, layers } = useStoreCache()

const itemSearchContent = ref('')
const itemSearchTempContent = ref('')

// Force update the item values when cache is updated.
const forceUpdate = ref(0)

const showRawCache = useLocalStorage('rstore-devtools-show-raw-cache', false)
const selectedCollection = useLocalStorage<string | null>('rstore-devtools-selected-cache-collection', null)
const cacheCollectionSearch = useLocalStorage('rstore-devtools-cache-collection-search', '')
const itemSearchKey = useLocalStorage('rstore-devtools-cache-item-search-key', '')

const filteredCollections = computed(() => {
  let result: Array<ResolvedCollection> = []

  if (!cacheCollectionSearch.value) {
    result = store.value.$collections
  }
  else {
    result = store.value.$collections.filter(collection => collection.name.toLowerCase().includes(cacheCollectionSearch.value.toLowerCase()))
  }

  return [...result].sort((a, b) => a.name.localeCompare(b.name))
})

const collectionSearchEl = useTemplateRef('collectionSearchEl')

const selectedLayerId = ref<string | undefined>()

const selectedLayer = computed(() => layers.value.find(layer => layer.id === selectedLayerId.value))

const selectedCache = computed(() => {
  if (selectedLayer.value) {
    return selectedLayer.value.state as Record<string, any>
  }

  if (!selectedCollection.value) {
    return {}
  }

  return cache.value.collections[selectedCollection.value as keyof typeof cache.value.collections] as Record<string, any> ?? {}
})

const deletedItemsFromLayer = computed(() => {
  const layer = selectedLayer.value
  if (layer?.collectionName === selectedCollection.value && layer.deletedItems.size) {
    return layer.deletedItems
  }

  return null
})

const filteredCache = computed(() => {
  function filteredByKey(collectionCache: Record<string, any> | undefined) {
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

  function filteredByContent(collectionCache: Record<string, any> | undefined) {
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

  // eslint-disable-next-line ts/no-unused-expressions
  forceUpdate.value

  let result = filteredByKey(selectedCache.value)
  result = filteredByContent(result)
  return result
})

const filteredCacheEntries = computed(() => {
  return Object.entries(filteredCache.value ?? {}).map(([key, value]) => ({
    id: key,
    key,
    value,
  }))
})

const cacheRows = computed(() => {
  const rows: Array<
    | { id: string, type: 'deleted-header', count: number }
    | { id: string, type: 'deleted-item', deletedItem: string | number }
    | { id: string, type: 'cache-item', key: string, value: any }
  > = []

  if (deletedItemsFromLayer.value?.size) {
    rows.push({
      id: 'deleted-header',
      type: 'deleted-header',
      count: deletedItemsFromLayer.value.size,
    })

    for (const deletedItem of deletedItemsFromLayer.value) {
      rows.push({
        id: `deleted-${String(deletedItem)}`,
        type: 'deleted-item',
        deletedItem,
      })
    }
  }

  for (const entry of filteredCacheEntries.value) {
    rows.push({
      id: `item-${entry.id}`,
      type: 'cache-item',
      key: entry.key,
      value: entry.value,
    })
  }

  return rows
})

const hasSelectedCollectionItems = computed(() => {
  return Boolean(Object.keys(selectedCache.value ?? {}).length || deletedItemsFromLayer.value?.size)
})

watch(cache, () => {
  forceUpdate.value++
})

const keySearchOptions = ref<string[]>([])

function updateKeySearchOptions() {
  keySearchOptions.value = Object.keys(selectedCache.value || {})
}

function clearCollectionSearch() {
  cacheCollectionSearch.value = ''
  collectionSearchEl.value?.inputRef?.focus()
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

watch(selectedCollection, () => {
  itemSearchKey.value = ''
  itemSearchContent.value = ''
  itemSearchTempContent.value = ''
})
</script>

<template>
  <div class="h-full min-h-0">
    <CodeSnippet
      v-if="showRawCache"
      :code="cache"
      class="text-xs p-2"
    />

    <div
      v-else
      class="flex items-stretch h-full min-h-0"
    >
      <div class="flex flex-col w-1/4 max-w-60 min-h-0">
        <div class="p-1">
          <UButtonGroup
            size="sm"
            class="w-full"
          >
            <UInput
              ref="collectionSearchEl"
              v-model="cacheCollectionSearch"
              placeholder="Collections..."
              icon="lucide:search"
              class="w-full"
            >
              <template v-if="cacheCollectionSearch" #trailing>
                <UButton
                  icon="lucide:x"
                  size="xs"
                  variant="link"
                  color="neutral"
                  @click="clearCollectionSearch()"
                />
              </template>
            </UInput>

            <USelectMenu
              v-model="selectedLayerId"
              icon="lucide:layers"
              :items="[
                { id: undefined,
                  label: 'Base cache state',
                  icon: 'lucide:database' },
                ...layers.map(layer => ({
                  id: layer.id,
                  label: layer.id,
                  icon: 'lucide:layers-2',
                  class: layer.skip ? 'text-dimmed' : 'text-yellow-500',
                  layer,
                })),
              ]"
              value-key="id"
              label-key="label"
              :placeholder="`${layers.length} layer${layers.length > 1 ? 's' : ''}`"
              arrow
              :content="{
                align: 'end',
              }"
              :ui="{
                content: 'min-w-60 w-min',
              }"
            >
              <template #item-label="{ item }">
                <template v-if="'layer' in item">
                  <span
                    :class="{
                      'line-through': item.layer.skip,
                    }"
                  >
                    {{ item.label }}
                  </span>
                </template>
              </template>

              <template #item-trailing="{ item }">
                <template v-if="'layer' in item">
                  <UBadge
                    v-if="item.layer.skip"
                    label="Skip"
                    icon="lucide:fast-forward"
                    color="neutral"
                    variant="subtle"
                  />
                  <UBadge
                    v-if="item.layer.optimistic"
                    label="Optimistic"
                    icon="lucide:hourglass"
                    color="info"
                    variant="subtle"
                  />
                </template>
              </template>
            </USelectMenu>
          </UButtonGroup>
        </div>

        <div class="flex-1 min-h-0">
          <DevtoolsVirtualList
            :items="filteredCollections"
            key-field="name"
            :min-item-size="40"
            list-class="p-1"
            item-class="pb-px"
          >
            <template #default="{ item }">
              <DevtoolsCacheCollectionItem
                :collection="item"
                :selected="isSelectedCollection(item.name)"
                :state="collectionState(item.name)"
                :selected-layer="collectionSelectedLayer(item.name)"
                @click="selectCollection(item.name)"
              />
            </template>

            <template #empty>
              <div class="p-2 text-xs italic opacity-50 text-center">
                No collections found.
              </div>
            </template>
          </DevtoolsVirtualList>
        </div>
      </div>

      <div v-if="selectedCollection" class="flex flex-col flex-1 min-h-0">
        <Empty
          v-if="!hasSelectedCollectionItems"
          icon="lucide:database"
          title="No items for this collection"
          class="h-full"
        />
        <Empty
          v-else-if="!cacheRows.length"
          icon="lucide:search"
          title="No items match the search"
          class="h-full"
        />
        <div v-else class="flex-1 min-h-0">
          <DevtoolsVirtualList
            :items="cacheRows"
            :min-item-size="52"
            list-class="p-1"
            item-class="pb-1"
          >
            <template #default="{ item }">
              <h2 v-if="item.type === 'deleted-header'" class="text-error font-bold">
                {{ `${item.count} item${item.count > 1 ? 's' : ''} deleted` }}
              </h2>

              <div
                v-else-if="item.type === 'deleted-item'"
                class="border border-error/50 rounded-lg p-2 font-mono text-xs text-error bg-error/10 flex items-center gap-2"
              >
                <UIcon name="lucide:trash" class="size-3.5" />
                {{ item.deletedItem }}
              </div>

              <div
                v-else
                class="border rounded-lg group/cache-item"
                :class="[
                  selectedLayer ? 'border-yellow-500 hover:border-yellow-600' : 'border-default hover:border-muted',
                ]"
              >
                <div class="font-mono text-xs sticky top-px h-[25px]">
                  <div class="bg-gradient-to-b from-white via-white to-transparent dark:from-[rgb(21,21,21)] dark:via-[rgb(21,21,21)] dark:to-[rgba(21,21,21,0)] via-75% absolute -top-px -left-px -right-px">
                    <div
                      class="p-2 border-t border-l border-r rounded-t-lg"
                      :class="[
                        selectedLayer ? 'border-yellow-500 group-hover/cache-item:border-yellow-600' : 'border-default group-hover/cache-item:border-muted',
                      ]"
                    >
                      {{ item.key }}
                    </div>
                  </div>
                </div>
                <CodeSnippet :key="forceUpdate" :code="item.value" class="text-xs p-2" />
              </div>
            </template>
          </DevtoolsVirtualList>
        </div>
      </div>
    </div>

    <Teleport to="#devtools-toolbar" defer>
      <UPopover
        v-if="!showRawCache"
        arrow
      >
        <UButton
          icon="lucide:search"
          label="Search items"
          size="xs"
          :variant="itemSearchKey || itemSearchContent ? 'solid' : 'soft'"
        />

        <template #content>
          <div class="p-2 w-80 flex flex-col gap-4">
            <UFormField label="Search item by Key">
              <UButtonGroup class="w-full" :gap="2">
                <UInputMenu
                  v-model="itemSearchKey"
                  :items="keySearchOptions"
                  placeholder="Item Key"
                  icon="lucide:search"
                  autofocus
                  :reset-search-term-on-blur="false"
                  class="w-full"
                  @update:open="$event ? updateKeySearchOptions() : null"
                />
                <UButton
                  :disabled="!itemSearchKey"
                  icon="lucide:x"
                  variant="outline"
                  color="neutral"
                  @click="clearItemSearchKey()"
                />
              </UButtonGroup>
            </UFormField>

            <UFormField label="Filter items by data">
              <template #hint>
                <div class="flex items-center gap-1">
                  <UButton
                    :disabled="!itemSearchTempContent || itemSearchTempContent === itemSearchContent"
                    icon="lucide:undo-2"
                    size="xs"
                    variant="soft"
                    @click="itemSearchTempContent = itemSearchContent"
                  />
                  <UButton
                    :disabled="!itemSearchTempContent"
                    icon="lucide:x"
                    size="xs"
                    variant="soft"
                    @click="itemSearchTempContent = itemSearchContent = ''"
                  />
                </div>
              </template>

              <div class="flex flex-col gap-2">
                <UTextarea
                  v-model="itemSearchTempContent"
                  placeholder="item.isActive && item.age > 18"
                  class="w-full font-mono"
                  :rows="3"
                  :ui="{
                    base: 'resize-none',
                  }"
                  @keyup.ctrl.enter="itemSearchContent = itemSearchTempContent"
                  @keyup.meta.enter="itemSearchContent = itemSearchTempContent"
                />
                <UButton
                  :disabled="!itemSearchTempContent || itemSearchTempContent === itemSearchContent"
                  size="sm"
                  icon="lucide:filter"
                  block
                  @click="itemSearchContent = itemSearchTempContent"
                >
                  Apply JavaScript filter
                  <div class="flex-1 flex justify-end gap-0.5">
                    <UKbd value="meta" />
                    <UKbd value="enter" />
                  </div>
                </UButton>
              </div>
            </UFormField>
          </div>
        </template>
      </UPopover>

      <USwitch
        v-model="showRawCache"
        size="xs"
        label="Raw"
        class="text-xs"
      />
    </Teleport>
  </div>
</template>
