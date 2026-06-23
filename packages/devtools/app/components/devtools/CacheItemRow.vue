<script lang="ts" setup>
import type { CacheRow } from '../../composables/cache-view'
import CodeSnippet from '../CodeSnippet.vue'

defineProps<{
  item: CacheRow
  forceUpdate: number
  selectedLayer: unknown
}>()
</script>

<template>
  <h2 v-if="item.type === 'deleted-header'" class="text-error font-bold">
    {{ `${item.count} item${item.count > 1 ? 's' : ''} deleted` }}
  </h2>

  <div
    v-else-if="item.type === 'deleted-item'"
    class="border border-error/50 rounded-lg p-2 font-mono text-xs text-error bg-error/10 flex items-center gap-2"
  >
    <UIcon name="lucide:trash" class="size-3.5" />
    {{ item.deletedItem }}
  </div>

  <div
    v-else
    class="border rounded-lg group/cache-item"
    :class="[
      selectedLayer ? 'border-yellow-500 hover:border-yellow-600' : 'border-default hover:border-muted',
    ]"
  >
    <div class="font-mono text-xs sticky top-px h-[25px]">
      <div class="bg-gradient-to-b from-white via-white to-transparent dark:from-[rgb(21,21,21)] dark:via-[rgb(21,21,21)] dark:to-[rgba(21,21,21,0)] via-75% absolute -top-px -left-px -right-px">
        <div
          class="p-2 border-t border-l border-r rounded-t-lg"
          :class="[
            selectedLayer ? 'border-yellow-500 group-hover/cache-item:border-yellow-600' : 'border-default group-hover/cache-item:border-muted',
          ]"
        >
          {{ item.key }}
        </div>
      </div>
    </div>
    <CodeSnippet :key="forceUpdate" :code="item.value" class="text-xs p-2" />
  </div>
</template>
