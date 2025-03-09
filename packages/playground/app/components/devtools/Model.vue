<script lang="ts" setup>
import type { Model, ModelDefaults, ModelMap, ResolvedModel } from '@rstore/shared'

const store = useStore()

const search = ref('')

const filteredTypes = computed(() => {
  return Object.keys(store.models).filter((key) => {
    return key.toLowerCase().includes(search.value.toLowerCase())
  }).sort().map(key => (store.models as any)[key]) as ResolvedModel<Model, ModelDefaults, ModelMap>[]
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
      <DevtoolsModelItem
        v-for="item in filteredTypes"
        :key="item.name"
        :item
      />
    </div>
  </div>
</template>
