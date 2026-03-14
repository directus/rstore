<script setup lang="ts">
import type { WebContainer, WebContainerProcess } from '@webcontainer/api'
import type { IDisposable, Terminal } from '@xterm/xterm'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createTutorialTerminalTheme, TUTORIAL_TERMINAL_FONT_FAMILY } from './utils/tutorialTerminalTheme'
import '@xterm/xterm/css/xterm.css'

const props = defineProps<{
  webContainer: WebContainer | null
}>()

const root = ref<HTMLElement | null>(null)

let terminal: Terminal | null = null
let fitAddon: import('@xterm/addon-fit').FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
let colorModeObserver: MutationObserver | null = null
let inputListener: IDisposable | null = null
let shellProcess: WebContainerProcess | null = null
let shellOutputReader: ReadableStreamDefaultReader<string> | null = null
let shellInputWriter: WritableStreamDefaultWriter<string> | null = null
let shellSession = 0

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
    cursorBlink: true,
    cursorStyle: 'bar',
    disableStdin: false,
    fontFamily: TUTORIAL_TERMINAL_FONT_FAMILY,
    fontSize: 12,
    lineHeight: 1.5,
    theme: createTutorialTerminalTheme(),
  })

  terminal.loadAddon(fitAddon)
  terminal.open(root.value)
  fitAddon.fit()

  resizeObserver = new ResizeObserver(() => {
    fitAddon?.fit()
    resizeShell()
  })
  resizeObserver.observe(root.value)

  colorModeObserver = new MutationObserver(() => {
    if (!terminal)
      return

    terminal.options.theme = createTutorialTerminalTheme()
    fitAddon?.fit()
    resizeShell()
  })
  colorModeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
}

function focusTerminal() {
  terminal?.focus()
}

function writeTerminalLine(message: string) {
  terminal?.writeln(message.replace(/\n/g, '\r\n'))
}

function getTerminalDimensions() {
  return {
    cols: Math.max(terminal?.cols ?? 80, 40),
    rows: Math.max(terminal?.rows ?? 24, 12),
  }
}

function resizeShell() {
  if (!shellProcess)
    return

  shellProcess.resize(getTerminalDimensions())
}

async function stopShell() {
  shellSession += 1

  inputListener?.dispose()
  inputListener = null

  if (shellInputWriter) {
    shellInputWriter.releaseLock()
    shellInputWriter = null
  }

  if (shellOutputReader) {
    await shellOutputReader.cancel().catch(() => null)
    shellOutputReader.releaseLock()
    shellOutputReader = null
  }

  const process = shellProcess
  shellProcess = null

  if (process) {
    try {
      process.kill()
      await Promise.race([
        process.exit,
        new Promise(resolve => window.setTimeout(resolve, 300)),
      ])
    }
    catch {
    }
  }
}

async function startShell(container: WebContainer | null) {
  await stopShell()
  await initTerminal()

  if (!terminal) {
    return
  }

  terminal.clear()

  if (!container) {
    writeTerminalLine('Shell will be available once the sandbox boots.')
    return
  }

  const currentSession = shellSession
  writeTerminalLine('Launching shell...')

  try {
    const process = await container.spawn('jsh', {
      terminal: getTerminalDimensions(),
    })

    if (currentSession !== shellSession) {
      process.kill()
      return
    }

    shellProcess = process
    shellInputWriter = process.input.getWriter()
    inputListener = terminal.onData((data) => {
      void shellInputWriter?.write(data).catch(() => null)
    })

    resizeShell()

    const reader = process.output.getReader()
    shellOutputReader = reader

    void process.exit.then((code) => {
      if (shellProcess === process) {
        writeTerminalLine(`\r\n[shell exited with code ${String(code)}]`)
      }
    }).catch((error) => {
      if (shellProcess === process) {
        writeTerminalLine(`\r\n[shell] ${String(error)}`)
      }
    })

    while (true) {
      if (shellProcess !== process)
        break

      const { done, value } = await reader.read()
      if (done)
        break

      terminal.write(value)
    }
  }
  catch (error) {
    if (currentSession === shellSession) {
      writeTerminalLine(`[shell] ${String(error)}`)
    }
  }
}

onMounted(async () => {
  await nextTick()
  await initTerminal()
  await startShell(props.webContainer)
})

watch(() => props.webContainer, (container) => {
  void startShell(container)
})

onBeforeUnmount(async () => {
  await stopShell()
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
  <div
    class="rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-black"
    @click="focusTerminal()"
  >
    <div ref="root" class="size-full" />
  </div>
</template>
