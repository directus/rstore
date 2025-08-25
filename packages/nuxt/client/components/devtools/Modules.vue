<script lang="ts" setup>
import { useDevtoolsClient } from '@nuxt/devtools-kit/iframe-client'

const client = useDevtoolsClient()
const store = useNonNullRstore()

const modules = () => store.value.$registeredModules

const search = useLocalStorage('rstore-search-modules', '')

const filteredModules = computed(() => {
  return Array.from(modules().entries())
    .filter(([moduleName]) => {
      return moduleName.toLowerCase().includes(search.value.toLowerCase())
    })
    .sort(([a], [b]) => a.localeCompare(b))
})

const refreshCount = ref(0)

function refresh() {
  refreshCount.value++
}

client.value?.host.nuxt.$rstoreModulesUpdated?.on(() => {
  refresh()
})
</script>

<template>
  <Empty
    v-if="!modules().size"
    icon="lucide:blocks"
    title="No active modules"
    class="h-full"
  />

  <div v-else class="flex flex-col h-full">
    <div class="p-1 flex items-center gap-1">
      <UInput
        v-model="search"
        icon="lucide:search"
        placeholder="Search"
        size="xs"
        autofocus
        class="w-full"
      />

      <UButton
        icon="lucide:refresh-cw"
        size="xs"
        color="neutral"
        variant="soft"
        @click="refresh()"
      />
    </div>

    <div :key="refreshCount" class="flex-1 overflow-auto min-h-0 flex flex-col p-1 gap-1">
      <DevtoolsModuleItem
        v-for="[moduleName, module] in filteredModules"
        :key="moduleName"
        :module
      />

      <div class="flex-none h-1" />
    </div>
  </div>
</template>
