<script lang="ts" setup>
import { tryOnScopeDispose, useLocalStorage } from '@vueuse/core'
import { computed, ref } from 'vue'

import { useNonNullRstore } from '../../composables/rstore'
import { useRstoreDevtoolsClient } from '../../utils/rstore-devtools-plugin'
import Empty from '../Empty.vue'
import DevtoolsModuleItem from './ModuleItem.vue'
import DevtoolsVirtualList from './VirtualList.vue'

const client = useRstoreDevtoolsClient()
const store = useNonNullRstore()

const modules = () => store.value.$registeredModules

const search = useLocalStorage('rstore-search-modules', '')

const refreshCount = ref(0)

const filteredModules = computed(() => {
  // eslint-disable-next-line ts/no-unused-expressions
  refreshCount.value

  return Array.from(modules().entries())
    .filter(([moduleName]) => moduleName.toLowerCase().includes(search.value.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([moduleName, module]) => ({
      id: moduleName,
      module,
    }))
})

function refresh() {
  refreshCount.value++
}

const stop = client.onModulesUpdated(() => {
  refresh()
})

if (typeof stop === 'function') {
  tryOnScopeDispose(stop)
}
</script>

<template>
  <Empty
    v-if="!modules().size"
    icon="lucide:blocks"
    title="No active modules"
    class="h-full"
  />

  <div v-else class="flex flex-col h-full">
    <div class="p-1 flex items-center gap-1">
      <UInput
        v-model="search"
        icon="lucide:search"
        placeholder="Search"
        size="xs"
        class="w-full"
      />

      <UButton
        icon="lucide:refresh-cw"
        size="xs"
        color="neutral"
        variant="soft"
        @click="refresh()"
      />
    </div>

    <div class="flex-1 min-h-0">
      <DevtoolsVirtualList
        :key="refreshCount"
        :items="filteredModules"
        :min-item-size="96"
        list-class="p-1"
        item-class="pb-1"
      >
        <template #default="{ item }">
          <DevtoolsModuleItem :module="item.module" />
        </template>

        <template #empty>
          <div class="p-4 text-xs italic opacity-50 text-center">
            No modules match the search.
          </div>
        </template>
      </DevtoolsVirtualList>
    </div>
  </div>
</template>
