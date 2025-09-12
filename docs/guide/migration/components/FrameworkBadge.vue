<script lang="ts" setup>
defineProps<{
  logo?: string
  name: string
  ignored?: boolean
}>()
</script>

<template>
  <div
    class="flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600"
    :class="{
      '*:opacity-50': ignored,
    }"
  >
    <img v-if="logo" :src="logo" :alt="name" class="size-4" />
    <span
      class="text-sm font-medium"
      :class="{
        'line-through': ignored,
      }"
    >{{ name }}</span>
  </div>
</template>
