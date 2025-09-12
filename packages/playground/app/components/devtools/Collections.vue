<script lang="ts" setup>
import type { Collection, CollectionDefaults, ResolvedCollection, StoreSchema } from '@rstore/shared'

const store = useStore()

const search = ref('')

const filteredTypes = computed(() => {
  return store.$collections.filter((collection) => {
    return collection.name.toLowerCase().includes(search.value.toLowerCase())
  }).sort((a, b) => a.name.localeCompare(b.name)) as ResolvedCollection<Collection, CollectionDefaults, StoreSchema>[]
})
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="p-1">
      <UInput
        v-model="search"
        icon="lucide:search"
        placeholder="Search"
        size="xs"
        variant="soft"
        autofocus
        class="w-full"
      />
    </div>

    <div class="flex-1 overlfow-auto min-h-0 flex flex-col p-1 gap-1">
      <DevtoolsCollectionItem
        v-for="item in filteredTypes"
        :key="item.name"
        :item
      />
    </div>
  </div>
</template>
