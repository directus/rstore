<script lang="ts" setup>
const store = useStore()

// Load all messages
const queries = await Promise.all([
  store.DataSource.queryMany(),
  store.DataCollection.queryMany(),
  store.DataField.queryMany(),
])

async function refresh() {
  await Promise.all(queries.map(q => q.refresh()))
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center gap-2 p-2">
      <UIcon
        name="lucide:database"
      />

      <h1>Database</h1>

      <UButton
        icon="lucide:refresh-cw"
        label="Refresh"
        size="xs"
        @click="refresh()"
      />
    </div>

    <div class="flex-1 min-h-0 flex divide-x divide-default items-stretch border border-default rounded-md m-2">
      <DatabaseDataSources class="w-60 p-2" />
      <NuxtPage class="flex-1 min-w-0" />
    </div>
  </div>
</template>
