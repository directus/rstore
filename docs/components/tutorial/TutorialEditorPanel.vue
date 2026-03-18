<script setup lang="ts">
import { SplitPanel } from '@directus/vue-split-panel'
import { Icon } from '@iconify/vue'
import { useLocalStorage, useMediaQuery } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import ToolbarButton from './ToolbarButton.vue'
import TutorialFileTree from './TutorialFileTree.vue'
import { buildTutorialFileTree, getTutorialFileVisual } from './utils'

const props = defineProps<{
  editableFiles: string[]
  openFiles: string[]
  selectedFile: string | null
  selectedFileEditable: boolean
  hasRuntime: boolean
}>()

const emit = defineEmits<{
  selectFile: [filePath: string]
}>()

const isDesktopExplorer = useMediaQuery('(min-width: 1280px)')
const sidebarSize = useLocalStorage('tutorialEditorSidebarSize', 280)
const mobileFilesOpen = ref(false)
const expandedFolders = ref<Record<string, boolean>>({})

const treeData = computed(() =>
  buildTutorialFileTree(props.openFiles, props.editableFiles, props.selectedFile),
)

const splitPanelUi = {
  start: 'min-w-0 min-h-0 overflow-hidden',
  divider: 'bg-transparent',
  end: 'min-w-0 min-h-0 overflow-hidden',
}

const selectedFileLabel = computed(() => props.selectedFile ?? 'No file selected')
const selectedFileVisual = computed(() => getTutorialFileVisual(props.selectedFile))

watch(treeData, (nextTree) => {
  const nextExpandedFolders: Record<string, boolean> = {}

  for (const folderPath of nextTree.folderPaths) {
    nextExpandedFolders[folderPath] = expandedFolders.value[folderPath] ?? true
  }

  for (const folderPath of nextTree.selectedAncestorPaths) {
    nextExpandedFolders[folderPath] = true
  }

  expandedFolders.value = nextExpandedFolders
}, { immediate: true })

watch(isDesktopExplorer, (desktop) => {
  if (desktop) {
    mobileFilesOpen.value = false
  }
})

function toggleFolder(folderPath: string) {
  expandedFolders.value = {
    ...expandedFolders.value,
    [folderPath]: !(expandedFolders.value[folderPath] ?? true),
  }
}

function handleSelectFile(filePath: string) {
  emit('selectFile', filePath)
  mobileFilesOpen.value = false
}

function renderExplorer() {
  return treeData.value.nodes.length > 0
}
</script>

<template>
  <article class="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
    <SplitPanel
      v-if="isDesktopExplorer"
      v-model:size="sidebarSize"
      orientation="horizontal"
      primary="start"
      size-unit="px"
      :min-size="220"
      :max-size="420"
      :ui="splitPanelUi"
      class="min-h-0 flex-1"
    >
      <template #start>
        <aside class="flex h-full min-h-0 flex-col overflow-y-auto p-2">
          <TutorialFileTree
            v-if="renderExplorer()"
            :nodes="treeData.nodes"
            :selected-file="selectedFile"
            :expanded-folders="expandedFolders"
            @select-file="handleSelectFile($event)"
            @toggle-folder="toggleFolder($event)"
          />

          <p v-else class="px-2 py-3 text-sm text-zinc-500 dark:text-zinc-400">
            No files available for this chapter yet.
          </p>
        </aside>
      </template>

      <template #divider>
        <div class="group flex h-full w-3 cursor-ew-resize items-center justify-center" aria-hidden="true">
          <span class="h-full w-px rounded-full bg-[color-mix(in_srgb,var(--vp-c-divider)_85%,transparent)] transition-colors group-hover:bg-[color-mix(in_srgb,var(--vp-c-brand-1)_70%,var(--vp-c-divider))]" />
        </div>
      </template>

      <template #end>
        <div class="flex h-full min-h-0 flex-col">
          <div class="flex items-center h-10 gap-2 px-3 py-2.5">
            <div class="min-w-0 flex flex-1 items-center gap-2">
              <Icon
                v-if="selectedFileVisual"
                :icon="selectedFileVisual.icon"
                class="size-4 shrink-0"
                :class="selectedFileVisual.iconClass"
              />

              <p class="min-w-0 flex-1 truncate font-mono text-xs text-zinc-600 dark:text-zinc-300">
                {{ selectedFileLabel }}
              </p>
            </div>

            <span
              v-if="selectedFile && !selectedFileEditable"
              class="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
            >
              <Icon icon="lucide:lock" class="size-3" />
              Read only
            </span>
          </div>

          <div
            v-if="!hasRuntime"
            class="grid min-h-0 flex-1 place-items-center p-6 text-center text-sm text-zinc-600 dark:text-zinc-300"
          >
            <div class="grid gap-2">
              <p>The Monaco editor loads with the tutorial runtime.</p>
              <p>You can still open the correction diff before starting if you want to compare the starter code with the expected solution.</p>
            </div>
          </div>

          <slot v-else />
        </div>
      </template>
    </SplitPanel>

    <template v-else>
      <div class="flex items-center gap-2 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
        <ToolbarButton @click="mobileFilesOpen = true">
          <Icon icon="lucide:files" class="text-base" />
          Files
        </ToolbarButton>

        <div class="min-w-0 flex flex-1 items-center gap-2">
          <Icon
            v-if="selectedFileVisual"
            :icon="selectedFileVisual.icon"
            class="size-4 shrink-0"
            :class="selectedFileVisual.iconClass"
          />

          <p class="min-w-0 flex-1 truncate font-mono text-xs text-zinc-600 dark:text-zinc-300">
            {{ selectedFileLabel }}
          </p>
        </div>

        <span
          v-if="selectedFile && !selectedFileEditable"
          class="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
        >
          <Icon icon="lucide:lock" class="size-3" />
          Read only
        </span>
      </div>

      <div
        v-if="!hasRuntime"
        class="grid min-h-0 flex-1 place-items-center p-6 text-center text-sm text-zinc-600 dark:text-zinc-300"
      >
        <div class="grid gap-2">
          <p>The Monaco editor loads with the tutorial runtime.</p>
          <p>You can still open the correction diff before starting if you want to compare the starter code with the expected solution.</p>
        </div>
      </div>

      <slot v-else />

      <div
        v-if="mobileFilesOpen"
        class="absolute inset-0 z-20 bg-zinc-950/35 backdrop-blur-[1px]"
        @click="mobileFilesOpen = false"
      >
        <aside
          class="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col border-r border-zinc-200 bg-zinc-50 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
          @click.stop
        >
          <div class="flex items-center justify-between border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
            <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Explorer
            </p>

            <button
              type="button"
              class="rounded-md p-1 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              aria-label="Close files drawer"
              @click="mobileFilesOpen = false"
            >
              <Icon icon="lucide:x" class="size-4" />
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto p-2">
            <TutorialFileTree
              v-if="renderExplorer()"
              :nodes="treeData.nodes"
              :selected-file="selectedFile"
              :expanded-folders="expandedFolders"
              @select-file="handleSelectFile($event)"
              @toggle-folder="toggleFolder($event)"
            />

            <p v-else class="px-2 py-3 text-sm text-zinc-500 dark:text-zinc-400">
              No files available for this chapter yet.
            </p>
          </div>
        </aside>
      </div>
    </template>
  </article>
</template>
