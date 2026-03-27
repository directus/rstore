<script setup lang="ts">
import type { WebContainer } from '@webcontainer/api'
import type { TutorialLogEntry } from './utils/tutorialRuntimeLogs'
import type { TutorialValidationResult } from './utils/types'
import { Icon } from '@iconify/vue'
import { ref } from 'vue'
import ToolbarButton from './ToolbarButton.vue'
import TutorialShellTerminal from './TutorialShellTerminal.vue'
import TutorialStepStatus from './TutorialStepStatus.vue'
import TutorialTerminal from './TutorialTerminal.vue'

defineProps<{
  listCount: number
  previewBaseUrl: string | null
  previewSrc: string | null
  lastError: string | null
  logs: TutorialLogEntry[]
  webContainer: WebContainer | null
  validation: TutorialValidationResult | null
  statusMessage: string
  status: string
  isBusy: boolean
}>()

const emit = defineEmits<{
  check: []
  showCorrection: []
  reload: []
}>()

const showLog = ref(false)
const activeRuntimeTab = ref<'logs' | 'terminal'>('logs')
</script>

<template>
  <article class="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 flex flex-col">
    <div class="flex flex-col gap-3 border-b border-zinc-200 px-4 h-14 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
      <div class="flex flex-wrap items-center gap-2">
        <span
          class="inline-flex items-center gap-2 rounded-full px-3 text-xs font-semibold uppercase tracking-[0.16em]"
          :class="status === 'error'
            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
            : previewSrc
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'"
        >
          <span
            class="size-2 rounded-full"
            :class="status === 'error'
              ? 'bg-rose-500'
              : previewSrc
                ? 'bg-emerald-500'
                : 'bg-amber-500'"
          />
          {{ status === 'error' ? 'Sandbox error' : previewSrc ? 'Sandbox live' : 'Sandbox booting' }}
        </span>

        <span class="rounded-full bg-zinc-100 px-3 text-xs font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          {{ listCount }} todo{{ listCount === 1 ? '' : 's' }} detected
        </span>
      </div>

      <div class="flex min-w-0 items-center gap-2 self-start sm:self-auto">
        <TutorialStepStatus
          :validation="validation"
          :status-message="statusMessage"
          :status="status"
          class="min-w-0 flex-1"
        />

        <ToolbarButton
          :disabled="isBusy"
          @click="emit('check')"
        >
          <Icon icon="lucide:badge-check" class="text-base" />
          Check chapter
        </ToolbarButton>

        <ToolbarButton
          :disabled="isBusy"
          @click="emit('showCorrection')"
        >
          Show correction
        </ToolbarButton>

        <ToolbarButton
          class="size-8 justify-center px-0 text-zinc-600 dark:text-zinc-200"
          :disabled="!previewBaseUrl"
          title="Reload preview"
          aria-label="Reload preview"
          @click="emit('reload')"
        >
          <Icon icon="lucide:rotate-cw" class="text-base" />
        </ToolbarButton>
      </div>
    </div>

    <div v-if="previewSrc" class="flex-[1_1_100%] min-h-0">
      <slot />
    </div>

    <div
      v-if="!previewSrc"
      class="grid flex-1 h-full place-items-center p-6 text-center"
    >
      <div class="grid max-w-md gap-3">
        <div class="mx-auto inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          <span class="size-2 rounded-full bg-amber-500" />
          Booting preview
        </div>

        <p class="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Preview output will appear here when the sandbox is ready. The tutorial runtime is already starting in the background, even if this chapter does not have much UI yet.
        </p>
        <p
          v-if="lastError"
          class="font-mono text-xs leading-6 text-rose-600 dark:text-rose-400"
        >
          {{ lastError }}
        </p>
      </div>
    </div>

    <div
      v-if="logs.length || webContainer"
      class="group border-t border-zinc-200 p-4 dark:border-zinc-800 bg-(--vp-c-bg) flex-none flex flex-col gap-2"
    >
      <button
        class="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400 flex items-center gap-1"
        @click="showLog = !showLog"
      >
        <Icon
          icon="lucide:chevron-right"
          class="transition-all duration-500"
          :class="{ 'rotate-90': showLog }"
        />
        Terminals
      </button>
      <div v-show="showLog" class="grid gap-3">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-full border px-3 py-1 text-xs font-medium transition"
            :class="activeRuntimeTab === 'logs'
              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
              : 'border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900'"
            @click="activeRuntimeTab = 'logs'"
          >
            Dev server
          </button>

          <button
            type="button"
            class="rounded-full border px-3 py-1 text-xs font-medium transition"
            :class="activeRuntimeTab === 'terminal'
              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
              : 'border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900'"
            @click="activeRuntimeTab = 'terminal'"
          >
            Shell
          </button>
        </div>

        <div class="h-56">
          <div v-show="activeRuntimeTab === 'logs'" class="size-full">
            <TutorialTerminal :logs class="size-full" />
          </div>

          <div v-show="activeRuntimeTab === 'terminal'" class="size-full">
            <TutorialShellTerminal :web-container="webContainer" class="size-full" />
          </div>
        </div>
      </div>
    </div>
  </article>
</template>
