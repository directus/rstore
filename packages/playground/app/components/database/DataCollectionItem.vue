<script lang="ts" setup>
defineProps<{
  collection: DataCollection
}>()

const route = useRoute()
</script>

<template>
  <UButton
    :to="`/database/${collection.dataSourceId}/${collection.id}`"
    :variant="route.params.collectionId === collection.id ? 'solid' : 'ghost'"
  >
    {{ collection.name }}
  </UButton>
</template>
