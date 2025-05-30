<script lang="ts" setup>
import { codeToHtml } from 'shiki'

const props = defineProps<{
  item: StoreHistoryItem
}>()

const startedAgo = useTimeAgo(() => props.item.started)
const duration = computed(() => {
  const diff = props.item.ended.getTime() - props.item.started.getTime()
  return diff < 1000 ? `${diff}ms` : `${(diff / 1000).toFixed(2)}s`
})

const icons = {
  fetchFirst: 'lucide:refresh-cw',
  fetchMany: 'lucide:refresh-cw',
  create: 'lucide:plus',
  update: 'lucide:pen',
  delete: 'lucide:trash',
}

const colorMode = useColorMode()
const resultHtml = asyncComputed(() => props.item.result
  ? codeToHtml(JSON.stringify(props.item.result, null, 2), {
      lang: 'json',
      theme: colorMode.value === 'dark' ? 'one-dark-pro' : 'one-light',
    })
  : '')
</script>

<template>
  <div class="p-1 bg-gray-500/10 hover:bg-gray-500/20 rounded-md">
    <div class="flex items-start gap-1 text-xs font-mono">
      <div class="flex-1">
        <UIcon
          :name="icons[props.item.operation]"
          class="mr-1 relative top-px"
          :class="{
            'text-blue-500': ['fetchFirst', 'fetchMany'].includes(item.operation),
            'text-orange-500': ['create', 'update', 'delete'].includes(item.operation),
          }"
        />
        <span
          class="mr-0.5"
          :class="{
            'text-blue-500': ['fetchFirst', 'fetchMany'].includes(item.operation),
            'text-orange-500': ['create', 'update', 'delete'].includes(item.operation),
          }"
        >{{ item.operation }}</span>
        <span class="font-bold">{{ item.model }}</span>
        <span>(</span>
        <span v-if="item.key" class="text-emerald-500">{{ item.key }}</span>
        <span v-else-if="item.findOptions" class="whitespace-pre-wrap text-emerald-500">{{ item.findOptions }}</span>
        <span v-if="(item.key || item.findOptions) && item.item">, </span>
        <span v-if="item.item" class="whitespace-pre-wrap text-pink-500">{{ item.item }}</span>
        <span>)</span>

        <UPopover
          arrow
        >
          <template #default="{ open }">
            <UBadge
              v-if="item.result && Array.isArray(item.result)"
              :label="item.result.length || '0'"
              icon="lucide:arrow-right"
              color="success"
              size="sm"
              :variant="item.result.length ? 'subtle' : 'outline'"
              class="font-sans align-middle ml-1 cursor-pointer"
              :class="{
                'outline outline-primary-500': open,
              }"
            />
            <UBadge
              v-if="item.result && !Array.isArray(item.result)"
              label="1"
              icon="lucide:arrow-right"
              color="success"
              size="sm"
              variant="subtle"
              class="font-sans align-middle ml-1 cursor-pointer"
              :class="{
                'outline outline-primary-500': open,
              }"
            />
          </template>

          <template #content>
            <div class="text-xs p-2 max-w-120 max-h-90 overflow-auto [&>.shiki]:!bg-transparent [&>.shiki]:whitespace-pre-wrap" v-html="resultHtml" />
          </template>
        </UPopover>

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
        <span>{{ duration }}</span>
      </div>
    </div>
  </div>
</template>
