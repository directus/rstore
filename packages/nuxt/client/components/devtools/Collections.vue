<script lang="ts" setup>
import type { Collection, CollectionDefaults, ResolvedCollection, StoreSchema } from '@rstore/shared'

const store = useNonNullRstore()

const search = useLocalStorage('rstore-search-collections', '')

const filteredTypes = computed(() => {
  return store.value.$collections.filter((collection) => {
    return collection.name.toLowerCase().includes(search.value.toLowerCase())
  }).sort((a, b) => a.name.localeCompare(b.name)) as ResolvedCollection<Collection, CollectionDefaults, StoreSchema>[]
})
</script>

<template>
  <div class="flex flex-col h-full">
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
          autofocus
          class="w-full"
        />
      </div>

      <div class="flex-1 overflow-auto min-h-0 flex flex-col p-1 gap-1">
        <DevtoolsCollectionItem
          v-for="item in filteredTypes"
          :key="item.name"
          :item
        />
        <div class="flex-none h-1" />
      </div>
    </template>
  </div>
</template>
