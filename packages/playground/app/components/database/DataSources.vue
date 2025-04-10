<script lang="ts" setup>
const store = useStore()
const { data: sources } = await store.DataSource.queryMany()
</script>

<template>
  <div class="flex flex-col overflow-y-auto">
    <div class="opacity-50 p-2">
      Data Sources
    </div>

    <DatabaseDataSourceItem
      v-for="source in sources"
      :key="source.id"
      :source
    />
  </div>
</template>
