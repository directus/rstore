<script lang="ts" setup>
import type { TabsItem } from '@nuxt/ui'

const stats = useStoreStats()

const tabs: Array<TabsItem> = [
  {
    label: 'Cache',
    slot: 'cache',
    icon: 'lucide:database',
  },
  {
    label: 'History',
    slot: 'history',
    icon: 'lucide:history',
  },
  {
    label: 'Model',
    slot: 'model',
    icon: 'lucide:boxes',
  },
]

const tab = useLocalStorage('rstore-devtools-tab', '0')

const currentTab = computed(() => tabs[Number.parseInt(tab.value)]!)

const cache = useStoreCache()
</script>

<template>
  <div class="flex flex-col">
    <div class="flex-none flex items-center gap-1 p-1 pb-0.5">
      <UTabs
        v-model="tab"
        :items="tabs"
        :default-value="tab"
        size="xs"
        variant="link"
        :content="false"
        class="flex-1"
        :ui="{
          list: 'border-b-0',
        }"
      />

      <div class="flex-1 flex justify-end items-center gap-1">
        <template v-if="currentTab.slot === 'history'">
          <UTooltip text="Clear history">
            <UButton
              icon="lucide:trash"
              size="xs"
              variant="soft"
              color="error"
              @click="clearStoreStats()"
            />
          </UTooltip>
        </template>
      </div>
    </div>

    <div class="overflow-auto flex-1">
      <template v-if="currentTab.slot === 'cache'">
        <CodeSnippet
          :code="cache"
          class="text-xs p-2"
        />
      </template>

      <template v-if="currentTab.slot === 'history'">
        <div class="flex flex-col-reverse p-1 gap-1">
          <DevtoolsHistoryItem
            v-for="(item, index) in stats.store"
            :key="index"
            :item
          />
        </div>
      </template>

      <template v-if="currentTab.slot === 'model'">
        <DevtoolsModel />
      </template>
    </div>
  </div>
</template>
