<script lang="ts" setup>
const plugins = useStorePlugins()
const search = useLocalStorage('rstore-search-plugins', '')

const filteredPlugins = computed(() => {
  return plugins.value.filter((plugin) => {
    return plugin.name.toLowerCase().includes(search.value.toLowerCase())
  }).sort((a, b) => a.name.localeCompare(b.name))
})
</script>

<template>
  <Empty
    v-if="!plugins.length"
    icon="lucide:puzzle"
    title="No registered plugins"
    class="h-full"
  />

  <div v-else class="flex flex-col h-full">
    <div class="p-1">
      <UInput
        v-model="search"
        icon="lucide:search"
        placeholder="Search"
        size="xs"
        variant="soft"
        autofocus
        class="w-full"
      />
    </div>

    <div class="flex-1 overflow-auto min-h-0 flex flex-col p-1 gap-1">
      <DevtoolsPluginItem
        v-for="plugin in filteredPlugins"
        :key="plugin.name"
        :plugin
      />

      <div class="flex-none h-1" />
    </div>
  </div>
</template>
