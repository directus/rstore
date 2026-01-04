<script lang="ts" setup>
const stats = useStoreStats()

const showCacheOps = useLocalStorage('rstore-devtools-show-cache-ops', false)
</script>

<template>
  <div v-if="stats">
    <Empty
      v-if="!stats.history.length"
      icon="lucide:history"
      title="No operations yet"
      class="h-full"
    />

    <div v-else class="flex flex-col-reverse p-1 gap-1">
      <DevtoolsHistoryItem
        v-for="(item, index) in showCacheOps ? stats.history : stats.history.filter((item) => !item.operation.startsWith('cache') && item.operation !== 'itemGarbageCollect')"
        :key="index"
        :item
      />
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
    </teleport>
  </div>
</template>
