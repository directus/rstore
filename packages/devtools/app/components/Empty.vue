<script lang="ts" setup>
defineProps<{
  title: string
  icon: string
}>()
</script>

<template>
  <div class="flex items-center justify-center flex-col gap-6 p-12 opacity-50">
    <UIcon :name="icon" class="size-12 opacity-75" />
    <div>{{ title }}</div>
  </div>
</template>
