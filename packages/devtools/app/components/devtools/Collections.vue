<script lang="ts" setup>
import type { Collection, CollectionDefaults, ResolvedCollection, StoreSchema } from '@rstore/shared'

import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'

import { useNonNullRstore } from '../../composables/rstore'
import Empty from '../Empty.vue'
import DevtoolsCollectionItem from './CollectionItem.vue'
import DevtoolsVirtualList from './VirtualList.vue'

const store = useNonNullRstore()

const search = useLocalStorage('rstore-search-collections', '')

const filteredCollections = computed(() => {
  return store.value.$collections.filter((collection) => {
    return collection.name.toLowerCase().includes(search.value.toLowerCase())
  }).sort((a, b) => a.name.localeCompare(b.name)) as ResolvedCollection<Collection, CollectionDefaults, StoreSchema>[]
})
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <Empty
      v-if="!store.$collections.length"
      icon="lucide:boxes"
      title="No collections found"
      class="h-full"
    />

    <template v-else>
      <div class="p-1">
        <UInput
          v-model="search"
          icon="lucide:search"
          placeholder="Search"
          size="xs"
          class="w-full"
        />
      </div>

      <div class="flex-1 min-h-0">
        <DevtoolsVirtualList
          :items="filteredCollections"
          key-field="name"
          :min-item-size="72"
          list-class="p-1"
          item-class="pb-1"
        >
          <template #default="{ item }">
            <DevtoolsCollectionItem :item="item" />
          </template>

          <template #empty>
            <div class="p-4 text-xs italic opacity-50 text-center">
              No collections match the search.
            </div>
          </template>
        </DevtoolsVirtualList>
      </div>
    </template>
  </div>
</template>
