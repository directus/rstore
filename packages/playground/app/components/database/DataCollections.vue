<script lang="ts" setup>
const props = defineProps<{
  source: DataSource
}>()

const store = useStore()

const { data: collections } = await store.DataCollection.query(q => q.many({
  filter: c => c.dataSourceId === props.source.id,
}))
</script>

<template>
  <div class="flex flex-col overflow-y-auto">
    <div class="opacity-50 p-2">
      Collections
    </div>

    <DatabaseDataCollectionItem
      v-for="collection in collections"
      :key="collection.id"
      :collection
    />
  </div>
</template>
