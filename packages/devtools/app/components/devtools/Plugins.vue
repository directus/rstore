<script lang="ts" setup>
import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'

import { useStorePlugins } from '../../composables/plugins'
import Empty from '../Empty.vue'
import DevtoolsPluginItem from './PluginItem.vue'
import DevtoolsVirtualList from './VirtualList.vue'

const plugins = useStorePlugins()
const search = useLocalStorage('rstore-search-plugins', '')

const filteredPlugins = computed(() => {
  return plugins.value
    .map((plugin, index) => ({
      id: plugin.name,
      plugin,
      index,
    }))
    .filter(({ plugin }) => plugin.name.toLowerCase().includes(search.value.toLowerCase()))
})
</script>

<template>
  <Empty
    v-if="!plugins.length"
    icon="lucide:puzzle"
    title="No registered plugins"
    class="h-full"
  />

  <div v-else class="flex flex-col h-full">
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
        :items="filteredPlugins"
        :min-item-size="96"
        list-class="p-1"
        item-class="pb-1"
      >
        <template #default="{ item }">
          <DevtoolsPluginItem
            :plugin="item.plugin"
            :index="item.index"
          />
        </template>

        <template #empty>
          <div class="p-4 text-xs italic opacity-50 text-center">
            No plugins match the search.
          </div>
        </template>
      </DevtoolsVirtualList>
    </div>
  </div>
</template>
