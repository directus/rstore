<script lang="ts" setup>
const props = defineProps<{
  item: StoreSubscriptionItem
}>()

const startedAgo = useTimeAgo(() => props.item.started)
</script>

<template>
  <div class="p-1 bg-gray-500/10 hover:bg-gray-500/20 rounded-md text-xs">
    <div class="flex items-center gap-2 font-mono">
      <div>
        {{ item.id }}
      </div>
      <div class="flex-1 min-w-0" />
      <div class="opacity-50 font-sans">
        {{ startedAgo }}
      </div>
    </div>

    <CodeSnippet
      :code="{
        key: item.key,
        findOptions: item.findOptions,
      }"
    />
  </div>
</template>
