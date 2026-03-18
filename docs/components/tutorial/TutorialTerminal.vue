<script setup lang="ts">
import type { TutorialLogEntry } from './utils/tutorialRuntimeLogs'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createTutorialTerminalTheme, TUTORIAL_TERMINAL_FONT_FAMILY } from './utils/tutorialTerminalTheme'
import '@xterm/xterm/css/xterm.css'

const props = defineProps<{
  logs: TutorialLogEntry[]
}>()

const root = ref<HTMLElement | null>(null)

let terminal: import('@xterm/xterm').Terminal | null = null
let fitAddon: import('@xterm/addon-fit').FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
let colorModeObserver: MutationObserver | null = null

async function initTerminal() {
  if (!root.value || terminal)
    return

  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
  ])

  fitAddon = new FitAddon()
  terminal = new Terminal({
    allowTransparency: true,
    convertEol: true,
    cursorBlink: false,
    cursorStyle: 'bar',
    disableStdin: true,
    fontFamily: TUTORIAL_TERMINAL_FONT_FAMILY,
    fontSize: 12,
    lineHeight: 1.5,
    theme: createTutorialTerminalTheme(),
  })

  terminal.loadAddon(fitAddon)
  terminal.open(root.value)
  fitAddon.fit()

  syncTerminalContent()

  resizeObserver = new ResizeObserver(() => {
    fitAddon?.fit()
  })
  resizeObserver.observe(root.value)

  colorModeObserver = new MutationObserver(() => {
    if (!terminal)
      return

    terminal.options.theme = createTutorialTerminalTheme()
    fitAddon?.fit()
  })
  colorModeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
}

function syncTerminalContent() {
  if (!terminal)
    return

  terminal.clear()

  const content = props.logs.map(log => log.text).join('\r\n')

  if (content) {
    terminal.write(content)
  }

  terminal.scrollToBottom()
}

onMounted(async () => {
  await nextTick()
  await initTerminal()
})

watch(() => props.logs, () => {
  syncTerminalContent()
}, { deep: true })

onBeforeUnmount(() => {
  colorModeObserver?.disconnect()
  colorModeObserver = null
  resizeObserver?.disconnect()
  resizeObserver = null
  fitAddon?.dispose()
  fitAddon = null
  terminal?.dispose()
  terminal = null
})
</script>

<template>
  <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-black">
    <div ref="root" class="size-full" />
  </div>
</template>
