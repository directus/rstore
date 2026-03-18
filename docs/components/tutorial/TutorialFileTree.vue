<script setup lang="ts">
import type { TutorialFileTreeNode } from './utils/types'
import { Icon } from '@iconify/vue'

defineOptions({
  name: 'TutorialFileTree',
})

const props = withDefaults(defineProps<{
  nodes: TutorialFileTreeNode[]
  selectedFile: string | null
  expandedFolders: Record<string, boolean>
  depth?: number
}>(), {
  depth: 0,
})

const emit = defineEmits<{
  selectFile: [filePath: string]
  toggleFolder: [folderPath: string]
}>()

function isExpanded(path: string) {
  return props.expandedFolders[path] ?? false
}

function getRowPadding(depth: number) {
  return `${depth * 20 + 5}px`
}
</script>

<template>
  <div class="grid gap-0.5">
    <template v-for="node in nodes" :key="node.path">
      <button
        v-if="node.type === 'folder'"
        type="button"
        class="group flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-[13px] font-medium text-zinc-600 transition hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-50"
        :style="{ paddingLeft: getRowPadding(depth) }"
        @click="emit('toggleFolder', node.path)"
      >
        <Icon
          icon="lucide:chevron-right"
          class="size-3.5 shrink-0 text-zinc-400 transition-transform group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-300"
          :class="{ 'rotate-90': isExpanded(node.path) }"
        />
        <Icon
          :icon="isExpanded(node.path) ? 'lucide:folder-open' : 'lucide:folder'"
          class="size-4 shrink-0 text-sky-500 dark:text-sky-400"
        />
        <span class="truncate">{{ node.name }}</span>
      </button>

      <template v-else>
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-md border border-transparent py-1.5 pr-2 text-left text-[13px] transition"
          :class="node.path === selectedFile
            ? 'bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-950'
            : 'text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-50'"
          :style="{ paddingLeft: getRowPadding(depth) }"
          :title="node.path"
          @click="emit('selectFile', node.path)"
        >
          <Icon
            :icon="node.icon"
            class="size-4 shrink-0"
            :class="[
              node.iconClass,
              node.path === selectedFile ? 'drop-shadow-[0_0_0.35rem_rgba(255,255,255,0.28)] dark:drop-shadow-none' : '',
            ]"
          />
          <span class="truncate font-medium">{{ node.name }}</span>
          <Icon
            v-if="!node.editable"
            icon="lucide:lock"
            class="ml-auto size-3.5 shrink-0"
            :class="node.path === selectedFile ? 'text-current/80' : 'text-zinc-400 dark:text-zinc-500'"
          />
        </button>
      </template>

      <TutorialFileTree
        v-if="node.type === 'folder' && isExpanded(node.path) && node.children.length"
        :nodes="node.children"
        :selected-file="selectedFile"
        :expanded-folders="expandedFolders"
        :depth="depth + 1"
        @select-file="emit('selectFile', $event)"
        @toggle-folder="emit('toggleFolder', $event)"
      />
    </template>
  </div>
</template>
