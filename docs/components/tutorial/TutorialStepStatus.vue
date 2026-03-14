<script setup lang="ts">
import type { TutorialValidationResult } from './utils/types'
import { Icon } from '@iconify/vue'
import { computed, ref } from 'vue'

const props = defineProps<{
  validation: TutorialValidationResult | null
  statusMessage: string
  status: string
}>()

const showDetails = ref(false)

const statusState = computed(() => {
  if (props.validation?.ok) {
    return {
      label: 'Passed',
      icon: 'lucide:badge-check',
      iconClass: 'text-emerald-600 dark:text-emerald-400',
      badgeClass: 'bg-emerald-50 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/20',
    }
  }

  if (props.validation && !props.validation.ok) {
    return {
      label: 'Needs work',
      icon: 'lucide:code',
      iconClass: 'text-amber-600 dark:text-amber-400',
      badgeClass: 'bg-amber-50 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/20',
    }
  }

  const states: Record<string, { label: string, icon: string, iconClass: string, badgeClass: string }> = {
    booting: {
      label: 'Booting',
      icon: 'lucide:loader-circle',
      iconClass: 'animate-spin text-sky-600 dark:text-sky-400',
      badgeClass: 'bg-sky-50 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/20',
    },
    installing: {
      label: 'Installing',
      icon: 'lucide:loader-circle',
      iconClass: 'animate-spin text-sky-600 dark:text-sky-400',
      badgeClass: 'bg-sky-50 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/20',
    },
    starting: {
      label: 'Starting',
      icon: 'lucide:loader-circle',
      iconClass: 'animate-spin text-sky-600 dark:text-sky-400',
      badgeClass: 'bg-sky-50 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/20',
    },
    syncing: {
      label: 'Syncing',
      icon: 'lucide:loader-circle',
      iconClass: 'animate-spin text-sky-600 dark:text-sky-400',
      badgeClass: 'bg-sky-50 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/20',
    },
    checking: {
      label: 'Checking',
      icon: 'lucide:loader-circle',
      iconClass: 'animate-spin text-sky-600 dark:text-sky-400',
      badgeClass: 'bg-sky-50 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/20',
    },
    error: {
      label: 'Error',
      icon: 'lucide:circle-x',
      iconClass: 'text-rose-600 dark:text-rose-400',
      badgeClass: 'bg-rose-50 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/10 dark:ring-rose-500/20',
    },
    ready: {
      label: 'Ready',
      icon: 'lucide:circle-help',
      iconClass: 'text-zinc-500 dark:text-zinc-400',
      badgeClass: 'bg-zinc-100 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700',
    },
    idle: {
      label: 'Idle',
      icon: 'lucide:circle-help',
      iconClass: 'text-zinc-500 dark:text-zinc-400',
      badgeClass: 'bg-zinc-100 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700',
    },
  }

  return states[props.status] ?? states.idle
})

const detailSummary = computed(() => props.validation?.summary ?? props.statusMessage)

const detailItems = computed(() => props.validation?.details ?? [])

function toggleDetails() {
  showDetails.value = !showDetails.value
}
</script>

<template>
  <article class="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
    <div
      v-if="showDetails"
      id="tutorial-status-details"
      class="border-b border-zinc-200 px-4 pb-4 pt-4 dark:border-zinc-800"
    >
      <div class="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/70">
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

    <div class="flex items-center gap-3 p-4">
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <span
          class="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full"
          :class="statusState.badgeClass"
        >
          <Icon
            :icon="statusState.icon"
            class="size-4"
            :class="statusState.iconClass"
          />
        </span>

        <p class="truncate pt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {{ detailSummary }}
        </p>
      </div>

      <div class="relative shrink-0">
        <button
          type="button"
          class="flex cursor-pointer items-center rounded-full p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
          :aria-expanded="showDetails"
          aria-controls="tutorial-status-details"
          aria-label="Show status details"
          @click.stop="toggleDetails()"
        >
          <Icon icon="lucide:circle-help" class="size-4" />
        </button>
      </div>
    </div>
  </article>
</template>
