<script setup lang="ts">
defineProps<{
  files: string[]
  selectedFile: string | null
  activeFiles?: string[]
  selectedFileActive?: boolean
  activeTitle?: string
  inactiveTitle?: string
  statusLabel?: string
}>()

const emit = defineEmits<{
  selectFile: [filePath: string]
}>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-zinc-200 px-1 py-1 dark:border-zinc-800">
    <button
      v-for="filePath in files"
      :key="filePath"
      class="relative inline-flex items-center p-2 text-sm font-medium transition-colors"
      :class="filePath === selectedFile
        ? 'text-zinc-950 dark:text-zinc-50'
        : activeFiles?.includes(filePath)
          ? 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
          : 'text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300'"
      :title="activeFiles?.includes(filePath)
        ? activeTitle
        : inactiveTitle"
      @click="emit('selectFile', filePath)"
    >
      {{ filePath }}
      <span
        v-if="filePath === selectedFile"
        class="absolute inset-x-0 bottom-0 h-px rounded-full bg-zinc-950 dark:bg-zinc-100"
      />
    </button>

    <span
      v-if="statusLabel && selectedFile && selectedFileActive === false"
      class="ml-auto inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
    >
      {{ statusLabel }}
    </span>
  </div>
</template>
