<script lang="ts" setup>
import type { TabsItem } from '@nuxt/ui'
import { codeToHtml } from 'shiki'

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
    label: 'Collection',
    slot: 'collection',
    icon: 'lucide:boxes',
  },
]

const tab = useLocalStorage('rstore-devtools-tab-demo', '0')

const currentTab = computed(() => tabs[Number.parseInt(tab.value)]!)

const cache = useCache()

const colorMode = useColorMode()
const cacheHtml = asyncComputed(() => codeToHtml(JSON.stringify(cache.value, null, 2), {
  lang: 'json',
  theme: colorMode.value === 'dark' ? 'one-dark-pro' : 'one-light',
}))
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
    </div>

    <div class="overflow-auto flex-1">
      <template v-if="currentTab.slot === 'cache'">
        <div class="text-xs p-2 [&>.shiki]:!bg-transparent [&>.shiki]:whitespace-pre-wrap" v-html="cacheHtml" />
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

      <template v-if="currentTab.slot === 'collection'">
        <DevtoolsCollections />
      </template>
    </div>
  </div>
</template>
