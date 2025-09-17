<script lang="ts">
import type { ResolvedCollection } from '@rstore/shared'

const itemSearchContent = ref('')
const itemSearchTempContent = ref('')
</script>

<script lang="ts" setup>
const store = useNonNullRstore()
const { cache, layers } = useStoreCache()

// Force update the item values when cache is updated
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
    result = store.value.$collections.filter(m => m.name.toLowerCase().includes(cacheCollectionSearch.value.toLowerCase()))
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
})

const collectionSearchEl = useTemplateRef('collectionSearchEl')

// Layers

const selectedLayerId = ref<string | undefined>()

const selectedLayer = computed(() => layers.value.find(layer => layer.id === selectedLayerId.value))

// Selected cache

const selectedCache = computed(() => {
  if (selectedLayer.value) {
    return selectedLayer.value.state
  }
  return cache.value[selectedCollection.value as keyof typeof cache.value] as Record<string, any>
})

const deletedItemsFromLayer = computed(() => {
  return selectedLayer.value?.deletedItems[selectedCollection.value as keyof typeof selectedLayer.value.deletedItems]
})

const filteredCache = computed(() => {
  function filteredByKey(cache: Record<string, any> | undefined) {
    if (!itemSearchKey.value || !cache) {
      return cache
    }
    const result: Record<string, string> = {}
    for (const key in cache) {
      if (key.includes(itemSearchKey.value)) {
        result[key] = cache[key]
      }
    }
    return result
  }

  function filteredByContent(cache: Record<string, any> | undefined) {
    if (!itemSearchContent.value || !cache) {
      return cache
    }
    try {
      // eslint-disable-next-line no-eval
      const filter = eval(`(item) => {
        return ${itemSearchContent.value}
      }`)
      const result: Record<string, string> = {}
      for (const key in cache) {
        if (filter(cache[key])) {
          result[key] = cache[key]
        }
      }
      return result
    }
    catch (error) {
      console.warn(`[rstore devtools] Invalid filter: ${itemSearchContent.value}`)
      console.warn(error)
      return cache
    }
  }

  // eslint-disable-next-line ts/no-unused-expressions
  forceUpdate.value // track changes

  let result = filteredByKey(selectedCache.value)
  result = filteredByContent(result)
  return result
})

watch(cache, () => {
  forceUpdate.value++
})

const keySearchOptions = ref<string[]>([])

function updateKeySearchOptions() {
  keySearchOptions.value = Object.keys(selectedCache.value || {})
}

watch(selectedCollection, () => {
  itemSearchKey.value = ''
  itemSearchContent.value = ''
  itemSearchTempContent.value = ''
})
</script>

<template>
  <div class="h-full">
    <CodeSnippet
      v-if="showRawCache"
      :code="cache"
      class="text-xs p-2"
    />

    <div
      v-else
      class="flex items-stretch h-full"
    >
      <!-- Collections -->
      <div class="flex flex-col w-1/4 max-w-60">
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
                  @click="cacheCollectionSearch = '';collectionSearchEl?.inputRef?.focus()"
                />
              </template>
            </UInput>
            <USelectMenu
              v-model="selectedLayerId"
              icon="lucide:layers"
              :items="[
                { id: undefined, label: 'Base cache state', icon: 'lucide:database' },
                ...layers.map(layer => ({ id: layer.id, label: layer.id, icon: 'lucide:layers-2', class: layer.skip ? 'text-dimmed' : 'text-yellow-500', layer })),
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
        <div class="flex flex-col flex-1 overflow-auto p-1 gap-px">
          <DevtoolsCacheCollectionItem
            v-for="collection in filteredCollections"
            :key="collection.name"
            :collection
            :selected="selectedCollection === collection.name"
            :state="selectedCache"
            :selected-layer
            @click="selectedCollection = collection.name"
          />

          <div v-if="!filteredCollections.length" class="p-2 text-xs italic opacity-50 text-center">
            No collections found.
          </div>
        </div>
      </div>

      <!-- Items -->
      <div v-if="selectedCollection" class="overflow-auto flex-1">
        <Empty
          v-if="!filteredCache || (!Object.keys(selectedCache).length && !deletedItemsFromLayer?.size)"
          icon="lucide:database"
          title="No items for this collection"
          class="h-full"
        />
        <Empty
          v-else-if="!Object.keys(filteredCache).length && !deletedItemsFromLayer?.size"
          icon="lucide:search"
          title="No items match the search"
          class="h-full"
        />
        <div v-else class="p-1 gap-1 flex flex-col">
          <template v-if="deletedItemsFromLayer">
            <h2 class="text-error font-bold">
              {{ `${deletedItemsFromLayer.size} item${deletedItemsFromLayer.size > 1 ? 's' : ''} deleted` }}
            </h2>
            <div
              v-for="deletedItem of deletedItemsFromLayer"
              :key="deletedItem"
              class="border border-error/50 rounded-lg p-2 font-mono text-xs text-error bg-error/10 flex items-center gap-2"
            >
              <UIcon name="lucide:trash" class="size-3.5" />
              {{ deletedItem }}
            </div>
          </template>

          <div
            v-for="(value, key) in filteredCache"
            :key
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
                  {{ key }}
                </div>
              </div>
            </div>
            <CodeSnippet :key="forceUpdate" :code="value" class="text-xs p-2" />
          </div>
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
                  @click="itemSearchKey = ''"
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
