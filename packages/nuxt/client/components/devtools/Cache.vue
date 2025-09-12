<script lang="ts">
</script>

<script lang="ts" setup>
import type { ResolvedCollection } from '@rstore/shared'

const itemSearchContent = ref('')

const store = useNonNullRstore()
const cache = useStoreCache()

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

// Selected cache

const selectedCache = computed(() => cache.value[selectedCollection.value as keyof typeof cache.value] as Record<string, any>)

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
          <UInput
            ref="collectionSearchEl"
            v-model="cacheCollectionSearch"
            placeholder="Search collections..."
            icon="lucide:search"
            size="xs"
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
        </div>
        <div class="flex flex-col flex-1 overflow-auto p-1 gap-px">
          <DevtoolsCacheCollectionItem
            v-for="collection in filteredCollections"
            :key="collection.name"
            :collection
            :selected="selectedCollection === collection.name"
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
          v-if="!filteredCache || !Object.keys(selectedCache).length"
          icon="lucide:database"
          title="No items for this collection"
          class="h-full"
        />
        <Empty
          v-else-if="!Object.keys(filteredCache).length"
          icon="lucide:search"
          title="No items match the search"
          class="h-full"
        />
        <div v-else class="p-1 gap-1 flex flex-col">
          <div
            v-for="(value, key) in filteredCache"
            :key
            class="border border-default rounded-lg group/cache-item hover:border-muted"
          >
            <div class="font-mono text-xs sticky top-px h-[25px]">
              <div class="bg-gradient-to-b from-white via-white to-transparent dark:from-[rgb(21,21,21)] dark:via-[rgb(21,21,21)] dark:to-[rgba(21,21,21,0)] via-75% absolute -top-px -left-px -right-px">
                <div class="p-2 border-t border-l border-r border-default group-hover/cache-item:border-muted rounded-t-lg">
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
          size="xs"
          :variant="itemSearchKey || itemSearchContent ? 'solid' : 'soft'"
        />

        <template #content>
          <div class="p-2 w-80 flex flex-col gap-2">
            <UFormField label="Search item by Key">
              <UInput
                v-model="itemSearchKey"
                placeholder="Item Key"
                icon="lucide:id-card"
                autofocus
                class="w-full"
              />
            </UFormField>
            <UFormField label="Filter items by data">
              <UTextarea
                v-model="itemSearchContent"
                placeholder="item.isActive && item.age > 18"
                class="w-full font-mono"
                :rows="3"
                :ui="{
                  base: 'resize-none',
                }"
              />
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
