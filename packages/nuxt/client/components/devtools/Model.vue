<script lang="ts" setup>
import type { Model, ModelDefaults, ResolvedModel, StoreSchema } from '@rstore/shared'

const store = useNonNullRstore()

const search = useLocalStorage('rstore-search-models', '')

const filteredTypes = computed(() => {
  return store.value.$models.filter((model) => {
    return model.name.toLowerCase().includes(search.value.toLowerCase())
  }).sort((a, b) => a.name.localeCompare(b.name)) as ResolvedModel<Model, ModelDefaults, StoreSchema>[]
})
</script>

<template>
  <div class="flex flex-col h-full">
    <Empty
      v-if="!store.$models.length"
      icon="lucide:boxes"
      title="No models found"
      class="h-full"
    />

    <template v-else>
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

      <div class="flex-1 overflow-auto min-h-0 flex flex-col p-1 gap-1">
        <DevtoolsModelItem
          v-for="item in filteredTypes"
          :key="item.name"
          :item
        />
        <div class="flex-none h-1" />
      </div>
    </template>
  </div>
</template>
