<script lang="ts" setup>
const props = defineProps<{
  item: StoreHistoryItem
}>()

const startedAgo = useTimeAgo(() => props.item.started ?? props.item.ended)
const duration = computed(() => {
  if (!props.item.started) {
    return null
  }
  const diff = props.item.ended.getTime() - props.item.started.getTime()
  return formatDuration(diff)
})

const icons = {
  fetchFirst: 'lucide:refresh-cw',
  fetchMany: 'lucide:refresh-cw',
  create: 'lucide:plus',
  update: 'lucide:pen',
  delete: 'lucide:trash',
  cacheWrite: 'lucide:database',
}
</script>

<template>
  <div class="p-1 bg-gray-500/10 hover:bg-gray-500/20 rounded-md">
    <div class="flex items-start gap-1 text-xs font-mono">
      <div class="flex-1">
        <span
          class="mr-0.5 space-x-1"
          :class="{
            'text-blue-500': ['fetchFirst', 'fetchMany'].includes(item.operation),
            'text-orange-500': ['create', 'update'].includes(item.operation),
            'text-red-500': ['delete'].includes(item.operation),
            'text-gray-500': ['cacheWrite'].includes(item.operation),
          }"
        >
          <UIcon
            :name="icons[props.item.operation]"
            class="relative top-0.5"
          />
          <span>{{ item.operation }}</span>
        </span>
        <span class="font-bold">{{ item.model }}</span>
        <span>(</span>
        <span v-if="item.key" class="text-emerald-500">{{ item.key }}</span>
        <span v-else-if="item.findOptions" class="whitespace-pre-wrap text-emerald-500">{{ JSON.stringify(item.findOptions, null, 2) }}</span>
        <span v-if="(item.key || item.findOptions) && item.item">, </span>
        <span v-if="item.item" class="whitespace-pre-wrap text-pink-500">{{ JSON.stringify(item.item, null, 2) }}</span>
        <span>)</span>

        <DevtoolsResultPopover :result="item.result" class="ml-1" />

        <UBadge
          v-if="item.server"
          label="SSR"
          icon="lucide:server"
          color="neutral"
          size="sm"
          variant="subtle"
          class="font-sans align-middle ml-1"
        />
      </div>
      <div class="flex items-baseline gap-2 pt-0.5 pr-0.5">
        <span class="opacity-50 font-sans">{{ startedAgo }}</span>
        <span v-if="duration">{{ duration }}</span>
      </div>
    </div>
  </div>
</template>
