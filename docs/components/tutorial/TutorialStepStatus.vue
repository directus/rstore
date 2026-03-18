<script setup lang="ts">
import type { TutorialValidationResult } from './utils/types'
import { Icon } from '@iconify/vue'
import { onClickOutside } from '@vueuse/core'
import { computed, nextTick, ref, useTemplateRef } from 'vue'

type TutorialStatus = 'idle' | 'booting' | 'installing' | 'starting' | 'ready' | 'syncing' | 'checking' | 'error'

interface StatusVisualState {
  icon: string
  iconClass: string
  badgeClass: string
}

const props = defineProps<{
  validation: TutorialValidationResult | null
  statusMessage: string
  status: TutorialStatus
}>()

const statusStates: Record<TutorialStatus, StatusVisualState> = {
  booting: {
    icon: 'lucide:loader-circle',
    iconClass: 'animate-spin text-sky-600 dark:text-sky-400',
    badgeClass: 'bg-sky-50 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/20',
  },
  installing: {
    icon: 'lucide:loader-circle',
    iconClass: 'animate-spin text-sky-600 dark:text-sky-400',
    badgeClass: 'bg-sky-50 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/20',
  },
  starting: {
    icon: 'lucide:loader-circle',
    iconClass: 'animate-spin text-sky-600 dark:text-sky-400',
    badgeClass: 'bg-sky-50 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/20',
  },
  syncing: {
    icon: 'lucide:loader-circle',
    iconClass: 'animate-spin text-sky-600 dark:text-sky-400',
    badgeClass: 'bg-sky-50 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/20',
  },
  checking: {
    icon: 'lucide:loader-circle',
    iconClass: 'animate-spin text-sky-600 dark:text-sky-400',
    badgeClass: 'bg-sky-50 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/20',
  },
  error: {
    icon: 'lucide:circle-x',
    iconClass: 'text-rose-600 dark:text-rose-400',
    badgeClass: 'bg-rose-50 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/10 dark:ring-rose-500/20',
  },
  ready: {
    icon: 'lucide:circle-help',
    iconClass: 'text-zinc-500 dark:text-zinc-400',
    badgeClass: 'bg-zinc-100 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700',
  },
  idle: {
    icon: 'lucide:circle-help',
    iconClass: 'text-zinc-500 dark:text-zinc-400',
    badgeClass: 'bg-zinc-100 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700',
  },
}

const showDetails = ref(false)

const statusState = computed(() => {
  if (props.validation?.ok) {
    return {
      icon: 'lucide:badge-check',
      iconClass: 'text-emerald-600 dark:text-emerald-400',
      badgeClass: 'bg-emerald-50 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/20',
    }
  }

  if (props.validation && !props.validation.ok) {
    return {
      icon: 'lucide:code',
      iconClass: 'text-amber-600 dark:text-amber-400',
      badgeClass: 'bg-amber-50 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/20',
    }
  }

  return statusStates[props.status]
})

const detailSummary = computed(() => props.validation?.summary ?? props.statusMessage)

const detailItems = computed(() => props.validation?.details ?? [])

function toggleDetails() {
  showDetails.value = !showDetails.value
}

const popover = useTemplateRef('popover')

onClickOutside(popover, () => {
  setTimeout(() => {
    showDetails.value = false
  }, 50)
})
</script>

<template>
  <div class="relative">
    <div class="flex min-w-0 items-center gap-2">
      <span
        class="inline-flex size-7 shrink-0 items-center justify-center rounded-full"
        :class="statusState.badgeClass"
      >
        <Icon
          :icon="statusState.icon"
          class="size-4"
          :class="statusState.iconClass"
        />
      </span>

      <p class="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {{ detailSummary }}
      </p>

      <button
        type="button"
        class="flex shrink-0 cursor-pointer items-center rounded-full p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
        :aria-expanded="showDetails"
        aria-controls="tutorial-status-details"
        aria-label="Show status details"
        @click.stop="toggleDetails()"
      >
        <Icon icon="lucide:circle-help" class="size-4" />
      </button>
    </div>

    <div
      v-if="showDetails"
      id="tutorial-status-details"
      ref="popover"
      class="absolute right-0 top-full z-10 mt-2 w-80 max-w-[min(24rem,calc(100vw-3rem))] rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
    >
      <p class="text-sm font-medium leading-6 text-zinc-900 dark:text-zinc-100">
        {{ detailSummary }}
      </p>

      <ul v-if="detailItems.length" class="mt-3 grid gap-2">
        <li
          v-for="detail in detailItems"
          :key="detail"
          class="text-sm leading-6 text-zinc-600 dark:text-zinc-300"
        >
          {{ detail }}
        </li>
      </ul>
    </div>
  </div>
</template>
