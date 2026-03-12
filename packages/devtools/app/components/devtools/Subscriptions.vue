<script lang="ts" setup>
import type { StoreSubscriptionItem } from '../../../src/types'

import { computed } from 'vue'
import { useStoreStats } from '../../composables/stats'
import Empty from '../Empty.vue'
import DevtoolsSubscription from './Subscription.vue'
import DevtoolsVirtualList from './VirtualList.vue'

const stats = useStoreStats()

const subscriptionGroups = computed(() => {
  const result = new Map<string, Array<StoreSubscriptionItem>>()
  if (stats.value?.subscriptions) {
    for (const subscription of stats.value.subscriptions) {
      if (!result.has(subscription.collection)) {
        result.set(subscription.collection, [])
      }
      result.get(subscription.collection)!.push(subscription)
    }
  }

  return Array.from(result.entries()).map(([collectionName, subscriptions]) => ({
    id: collectionName,
    collectionName,
    subscriptions,
  }))
})
</script>

<template>
  <Empty
    v-if="!subscriptionGroups.length"
    icon="lucide:bell-off"
    title="No active subscriptions"
    class="h-full"
  />

  <div v-else class="h-full min-h-0">
    <DevtoolsVirtualList
      :items="subscriptionGroups"
      :min-item-size="88"
      list-class="p-1"
      item-class="pb-1"
    >
      <template #default="{ item }">
        <div class="border border-blue-500/10 rounded-lg p-1">
          <h2 class="flex items-center gap-2 p-2">
            <span class="truncate min-w-0 text-blue-500">{{ item.collectionName }}</span>
            <UBadge icon="lucide:bell" color="info" variant="soft">
              {{ item.subscriptions.length }}
            </UBadge>
          </h2>

          <DevtoolsSubscription
            v-for="subscription in item.subscriptions"
            :key="subscription.id"
            :item="subscription"
          />
        </div>
      </template>
    </DevtoolsVirtualList>
  </div>
</template>
