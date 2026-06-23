<script lang="ts" setup>
import Empty from '../Empty.vue'
import CacheItemRow from './CacheItemRow.vue'
import DevtoolsVirtualList from './VirtualList.vue'

defineProps<{
  view: any
}>()
</script>

<template>
  <div v-if="view.selectedCollection" class="flex flex-col flex-1 min-h-0">
    <Empty
      v-if="!view.hasSelectedCollectionItems"
      icon="lucide:database"
      title="No items for this collection"
      class="h-full"
    />
    <Empty
      v-else-if="!view.cacheRows.length"
      icon="lucide:search"
      title="No items match the search"
      class="h-full"
    />
    <div v-else class="flex-1 min-h-0">
      <DevtoolsVirtualList
        :items="view.cacheRows"
        :min-item-size="52"
        list-class="p-1"
        item-class="pb-1"
      >
        <template #default="{ item }">
          <CacheItemRow
            :item="item"
            :force-update="view.forceUpdate"
            :selected-layer="view.selectedLayer"
          />
        </template>
      </DevtoolsVirtualList>
    </div>
  </div>
</template>
