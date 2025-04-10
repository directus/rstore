<script lang="ts" setup>
defineProps<{
  source: DataSource
}>()

const route = useRoute()
</script>

<template>
  <UButton
    :to="`/database/${source.id}`"
    :variant="route.params.sourceId === source.id ? 'solid' : 'ghost'"
  >
    {{ source.name }}
  </UButton>
</template>
