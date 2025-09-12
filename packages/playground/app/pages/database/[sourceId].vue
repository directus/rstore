<script lang="ts" setup>
const route = useRoute()
const store = useStore()
const { data: source } = await store.DataSource.query(q => q.first({
  filter: s => s.id === route.params.sourceId,

  include: {
    collections: {
      fields: true,
    },
    // meow: 'meow',
  },

  params: {
    // meow: 'meow',
    filter: `id:${route.params.sourceId}`,
  },

  // meow: 'meow',
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
