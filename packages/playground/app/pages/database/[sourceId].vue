<script lang="ts" setup>
const route = useRoute()
const store = useStore()
const { data: source } = await store.DataSource.queryFirst(() => ({
  filter: s => s.id === route.params.sourceId,
}))
</script>

<template>
  <div v-if="source" class="flex-1 min-h-0 flex divide-x divide-default items-stretch">
    <DatabaseDataCollections
      :source
      class="w-60 p-2"
    />
    <NuxtPage class="flex-1 min-w-0" />
  </div>
</template>
