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

      <div id="devtools-toolbar" class="flex-1 flex justify-end items-center gap-2 pr-2" />
    </div>

    <div class="overflow-auto flex-1">
      <template v-if="currentTab.slot === 'cache'">
        <DevtoolsCache />
      </template>

      <template v-if="currentTab.slot === 'history'">
        <DevtoolsHistory />
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
