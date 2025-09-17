<script lang="ts" setup>
import type { CacheLayer, Collection } from '@rstore/shared'

const props = defineProps<{
  collection: Collection
  state: Record<string, Record<string, any>>
  selectedLayer?: CacheLayer
  selected?: boolean
}>()

const cacheCount = computed(() => Object.keys(props.state?.[props.collection.name] ?? {}).length)
</script>

<template>
  <UButton
    v-bind="selected ? {
      color: selectedLayer ? 'warning' : 'primary',
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
      :color="selected ? selectedLayer ? 'warning' : 'primary' : 'neutral'"
      variant="soft"
      size="sm"
      :class="{
        'font-bold': cacheCount > 0,
      }"
    />

    <UBadge
      v-if="selectedLayer?.deletedItems[props.collection.name]?.size"
      :label="selectedLayer?.deletedItems[props.collection.name]?.size || '0'"
      color="error"
      variant="soft"
      size="sm"
      icon="lucide:trash"
    />
  </UButton>
</template>
