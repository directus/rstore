<script lang="ts" setup>
import type { Collection } from '@rstore/shared'

const props = defineProps<{
  collection: Collection
  selected?: boolean
}>()

const cache = useStoreCache()

const cacheCount = computed(() => Object.keys((cache.value as any)[props.collection.name] ?? {}).length)
</script>

<template>
  <UButton
    v-bind="selected ? {
      color: 'primary',
      variant: 'subtle',
    } : {
      color: 'neutral',
      variant: 'ghost',
    }"
    size="sm"
    class="w-full h-8 flex-none"
  >
    <span class="text-start flex-1 truncate min-w-0">
      {{ collection.name }}
    </span>

    <UBadge
      v-if="cacheCount"
      :label="cacheCount || '0'"
      :color="selected ? 'primary' : 'neutral'"
      variant="soft"
      size="sm"
      :class="{
        'font-bold': cacheCount > 0,
      }"
    />
  </UButton>
</template>
