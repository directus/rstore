<script lang="ts" setup>
import type { Model } from '@rstore/shared'

const props = defineProps<{
  model: Model
  selected?: boolean
}>()

const cache = useStoreCache()

const cacheCount = computed(() => Object.keys((cache.value as any)[props.model.name] ?? {}).length)
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
    class="w-full h-8"
  >
    <span class="text-start flex-1 truncate min-w-0">
      {{ model.name }}
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
