<script lang="ts" setup>
import type { StoreSubscriptionItem } from '../../../src/types'

import { computed } from 'vue'
import { useStoreStats } from '../../composables/stats'
import Empty from '../Empty.vue'
import DevtoolsSubscription from './Subscription.vue'

const stats = useStoreStats()

const subscriptionsPerCollection = computed(() => {
  const result = new Map<string, Array<StoreSubscriptionItem>>()
  if (stats.value?.subscriptions) {
    for (const subscription of stats.value.subscriptions) {
      if (!result.has(subscription.collection)) {
        result.set(subscription.collection, [])
      }
      result.get(subscription.collection)!.push(subscription)
    }
  }
  return result
})
</script>

<template>
  <div
    v-for="[collectionName, subscriptions] in subscriptionsPerCollection"
    :key="collectionName"
    class="m-1 border border-blue-500/10 rounded-lg p-1"
  >
    <h2 class="flex items-center gap-2 p-2">
      <span class="truncate min-w-0 text-blue-500">{{ collectionName }}</span>
      <UBadge icon="lucide:bell" color="info" variant="soft">
        {{ subscriptions.length }}
      </UBadge>
    </h2>

    <DevtoolsSubscription
      v-for="subscription in subscriptions"
      :key="subscription.id"
      :item="subscription"
    />
  </div>

  <Empty
    v-if="!subscriptionsPerCollection.size"
    icon="lucide:bell-off"
    title="No active subscriptions"
    class="h-full"
  />
</template>
