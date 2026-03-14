<script setup lang="ts">
import TutorialFileTabs from './TutorialFileTabs.vue'

defineProps<{
  editableFiles: string[]
  openFiles: string[]
  selectedFile: string | null
  selectedFileEditable: boolean
  hasRuntime: boolean
}>()

const emit = defineEmits<{
  selectFile: [filePath: string]
}>()
</script>

<template>
  <article class="flex flex-col min-h-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
    <TutorialFileTabs
      :files="openFiles"
      :selected-file="selectedFile"
      :active-files="editableFiles"
      :selected-file-active="selectedFileEditable"
      active-title="Editable in this step"
      inactive-title="Read-only from another step"
      status-label="Read only"
      @select-file="emit('selectFile', $event)"
    />

    <div
      v-if="!hasRuntime"
      class="grid place-items-center p-6 text-center text-sm text-zinc-600 dark:text-zinc-300"
    >
      <div class="grid gap-2">
        <p>The Monaco editor loads with the tutorial runtime.</p>
        <p>You can still open the correction diff before starting if you want to compare the starter code with the expected solution.</p>
      </div>
    </div>

    <slot v-else />
  </article>
</template>
