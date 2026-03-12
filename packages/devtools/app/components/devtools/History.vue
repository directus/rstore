<script lang="ts" setup>
import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'

import { clearStoreStats, useStoreStats } from '../../composables/stats'
import Empty from '../Empty.vue'
import DevtoolsHistoryItem from './HistoryItem.vue'
import DevtoolsVirtualList from './VirtualList.vue'

const stats = useStoreStats()

const showCacheOps = useLocalStorage('rstore-devtools-show-cache-ops', false)

const filteredHistory = computed(() => {
  const history = stats.value?.history ?? []
  const items = showCacheOps.value
    ? history
    : history.filter(historyItem => !historyItem.operation.startsWith('cache') && historyItem.operation !== 'itemGarbageCollect')

  return [...items]
    .reverse()
    .map((item, index) => ({
      id: `${item.ended.getTime()}-${item.operation}-${item.collection}-${index}`,
      item,
    }))
})
</script>

<template>
  <div v-if="stats" class="flex flex-col h-full min-h-0">
    <Empty
      v-if="!filteredHistory.length"
      icon="lucide:history"
      title="No operations yet"
      class="h-full"
    />

    <div v-else class="flex-1 min-h-0">
      <DevtoolsVirtualList
        :items="filteredHistory"
        :min-item-size="44"
        list-class="p-1"
        item-class="pb-1"
      >
        <template #default="{ item }">
          <DevtoolsHistoryItem :item="item.item" />
        </template>
      </DevtoolsVirtualList>
    </div>

    <Teleport to="#devtools-toolbar" defer>
      <USwitch
        v-model="showCacheOps"
        size="xs"
        label="Cache"
        class="text-xs"
      />

      <UTooltip text="Clear history">
        <UButton
          icon="lucide:trash"
          size="xs"
          variant="soft"
          color="error"
          @click="clearStoreStats()"
        />
      </UTooltip>
    </Teleport>
  </div>
</template>
