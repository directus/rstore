<script setup lang="ts">
import type * as monaco from 'monaco-editor'
import type { TutorialSnapshot } from './utils/types'
import { nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import {
  ensureTutorialMonacoWorkspace,
  getTutorialDiffModel,
  getTutorialProjectModel,
  updateTutorialWorkspaceSnapshot,
} from './utils/tutorialMonacoWorkspace'
import { TUTORIAL_WORKSPACE_ROOT } from './utils/tutorialServerUrls'

type MonacoApi = typeof monaco

const props = withDefaults(defineProps<{
  variant?: 'editor' | 'diff'
  stepId: string
  filePath: string | null
  readOnly?: boolean
  projectFiles?: TutorialSnapshot
  solutionFiles?: TutorialSnapshot
}>(), {
  variant: 'editor',
  readOnly: false,
  projectFiles: () => ({}),
  solutionFiles: () => ({}),
})

const emit = defineEmits<{
  change: [payload: { filePath: string, value: string }]
}>()

const container = shallowRef<HTMLElement | null>(null)
const monacoApi = shallowRef<MonacoApi | null>(null)
const editor = shallowRef<monaco.editor.IStandaloneDiffEditor | monaco.editor.IStandaloneCodeEditor | null>(null)

let colorModeObserver: MutationObserver | null = null
let stopModelListener: { dispose: () => void } | null = null
let suppressedModelChangeEvents = 0

function isDarkMode() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
}

function getThemeName() {
  return isDarkMode() ? 'rstore-docs-dark' : 'rstore-docs-light'
}

async function ensureMonaco() {
  monacoApi.value ??= await ensureTutorialMonacoWorkspace()
  monacoApi.value.editor.setTheme(getThemeName())
  return monacoApi.value
}

function attachEditorListener() {
  stopModelListener?.dispose()
  stopModelListener = null

  if (props.variant !== 'editor' || !editor.value)
    return

  const standaloneEditor = editor.value as monaco.editor.IStandaloneCodeEditor

  stopModelListener = standaloneEditor.onDidChangeModelContent(() => {
    if (suppressedModelChangeEvents > 0)
      return

    const currentModel = standaloneEditor.getModel()
    if (!currentModel)
      return

    const filePath = getWorkspaceRelativePath(currentModel.uri.toString())
    if (!filePath)
      return

    emit('change', {
      filePath,
      value: currentModel.getValue(),
    })
  })
}

function getWorkspaceRelativePath(uri: string) {
  const path = uri.replace(/^file:\/\//, '')
  if (!path.startsWith(`${TUTORIAL_WORKSPACE_ROOT}/`)) {
    return null
  }

  return path.slice(TUTORIAL_WORKSPACE_ROOT.length + 1)
}

async function ensureEditor() {
  const monaco = await ensureMonaco()
  if (!container.value)
    return null

  if (!editor.value) {
    editor.value = props.variant === 'diff'
      ? monaco.editor.createDiffEditor(container.value, {
          automaticLayout: true,
          originalEditable: false,
          minimap: { enabled: false },
          renderSideBySide: true,
          scrollBeyondLastLine: false,
          theme: getThemeName(),
          fontSize: 13,
          lineHeight: 20,
        })
      : monaco.editor.create(container.value, {
          automaticLayout: true,
          minimap: { enabled: false },
          padding: { top: 16 },
          readOnly: props.readOnly,
          roundedSelection: false,
          scrollBeyondLastLine: false,
          theme: getThemeName(),
          fontSize: 13,
          lineHeight: 20,
        })

    attachEditorListener()
  }

  return editor.value
}

async function syncEditor() {
  const instance = await ensureEditor()
  if (!instance)
    return

  suppressedModelChangeEvents += 1

  try {
    updateTutorialWorkspaceSnapshot(props.projectFiles)
    if (props.variant === 'editor') {
      (instance as monaco.editor.IStandaloneCodeEditor).updateOptions({
        readOnly: props.readOnly,
      })
    }

    if (!props.filePath) {
      if (props.variant === 'diff') {
        (instance as monaco.editor.IStandaloneDiffEditor).setModel(null)
      }
      else {
        (instance as monaco.editor.IStandaloneCodeEditor).setModel(null)
      }
      return
    }

    if (props.variant === 'diff') {
      const diffEditor = instance as monaco.editor.IStandaloneDiffEditor
      const [original, modified] = await Promise.all([
        getTutorialDiffModel({
          contents: props.projectFiles[props.filePath] ?? '',
          filePath: props.filePath,
          kind: 'project',
          stepId: props.stepId,
        }),
        getTutorialDiffModel({
          contents: props.solutionFiles[props.filePath] ?? '',
          filePath: props.filePath,
          kind: 'solution',
          stepId: props.stepId,
        }),
      ])

      diffEditor.setModel({
        original,
        modified,
      })
      return
    }

    const standaloneEditor = instance as monaco.editor.IStandaloneCodeEditor
    const model = await getTutorialProjectModel(props.filePath)
    if (standaloneEditor.getModel() !== model) {
      standaloneEditor.setModel(model)
    }
  }
  finally {
    suppressedModelChangeEvents -= 1
  }
}

async function recreateEditor() {
  editor.value?.dispose()
  editor.value = null
  stopModelListener?.dispose()
  stopModelListener = null
  await nextTick()
  await syncEditor()
}

onMounted(async () => {
  await nextTick()
  await syncEditor()

  colorModeObserver = new MutationObserver(() => {
    if (monacoApi.value) {
      monacoApi.value.editor.setTheme(getThemeName())
    }
  })

  colorModeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })

  editor.value?.layout()
})

watch(() => props.filePath, async () => {
  await syncEditor()
})

watch(() => props.projectFiles, async () => {
  await syncEditor()
})

watch(() => props.solutionFiles, async () => {
  if (props.variant === 'diff') {
    await syncEditor()
  }
})

watch(() => props.stepId, async () => {
  await syncEditor()
})

watch(() => props.variant, async () => {
  await recreateEditor()
})

watch(() => props.readOnly, async () => {
  if (props.variant === 'editor') {
    await syncEditor()
  }
})

onBeforeUnmount(() => {
  colorModeObserver?.disconnect()
  colorModeObserver = null
  stopModelListener?.dispose()
  stopModelListener = null
  editor.value?.dispose()
  editor.value = null
})
</script>

<template>
  <div ref="container" class="size-full" />
</template>
