<script lang="ts" setup>
import type { TabsItem } from '@nuxt/ui'

const tabs: Array<TabsItem> = [
  {
    label: 'Models',
    slot: 'model',
    icon: 'lucide:boxes',
  },
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
    label: 'Subscriptions',
    slot: 'subscriptions',
    icon: 'lucide:bell',
  },
  {
    label: 'Modules',
    slot: 'modules',
    icon: 'lucide:circuit-board',
  },
  {
    label: 'Plugins',
    slot: 'plugins',
    icon: 'lucide:puzzle',
  },
]

const tab = useLocalStorage('rstore-devtools-tab', '0')

const currentTab = computed(() => tabs[Number.parseInt(tab.value)] ?? tabs[0])

const cache = useStoreCache()

const stats = useStoreStats()

const showCacheOps = useLocalStorage('rstore-devtools-show-cache-ops', false)
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

      <div class="flex-1 flex justify-end items-center gap-2">
        <template v-if="currentTab.slot === 'history'">
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
        <Empty
          v-if="!stats.history.length"
          icon="lucide:history"
          title="No operations yet"
          class="h-full"
        />

        <div v-else class="flex flex-col-reverse p-1 gap-1">
          <DevtoolsHistoryItem
            v-for="(item, index) in showCacheOps ? stats.history : stats.history.filter((item) => !item.operation.startsWith('cache'))"
            :key="index"
            :item
          />
        </div>
      </template>

      <template v-if="currentTab.slot === 'model'">
        <DevtoolsModel />
      </template>

      <template v-if="currentTab.slot === 'subscriptions'">
        <DevtoolsSubscriptions />
      </template>

      <template v-if="currentTab.slot === 'modules'">
        <DevtoolsModules />
      </template>

      <template v-if="currentTab.slot === 'plugins'">
        <DevtoolsPlugins />
      </template>
    </div>
  </div>
</template>
