<script setup lang="ts">
import { Icon } from '@iconify/vue'

withDefaults(defineProps<{
  label: string
  chapterTitle: string
  icon: string
  iconPosition?: 'start' | 'end'
  type?: 'button' | 'submit' | 'reset'
}>(), {
  iconPosition: 'start',
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <button
    :type="type ?? 'button'"
    class="flex flex-col gap-4 justify-between rounded-2xl border border-transparent px-5 py-4 transition hover:border-zinc-400 dark:hover:border-zinc-600"
    :class="[
      iconPosition === 'start' ? 'items-start text-left' : 'items-end text-right',
    ]"
    @click="emit('click', $event)"
  >
    <span class="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 dark:text-zinc-300">
      <Icon v-if="iconPosition !== 'end'" :icon="icon" class="size-4" />
      {{ label }}
      <Icon v-if="iconPosition === 'end'" :icon="icon" class="size-4" />
    </span>

    <span class="text-lg font-semibold text-zinc-950 dark:text-zinc-100">
      {{ chapterTitle }}
    </span>
  </button>
</template>
