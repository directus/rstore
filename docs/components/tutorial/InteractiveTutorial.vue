<script setup lang="ts">
import type { FileSystemTree, WebContainer } from '@webcontainer/api'
import type { TutorialPreviewState, TutorialSnapshot, TutorialStep, TutorialSupportState, TutorialValidationResult } from './utils/types'
import { SplitPanel } from '@directus/vue-split-panel'
import { useLocalStorage } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import MonacoEditor from './MonacoEditor.vue'
import { tutorialSteps } from './steps'
import TutorialCorrectionDialog from './TutorialCorrectionDialog.vue'
import TutorialEditorPanel from './TutorialEditorPanel.vue'
import TutorialPreviewPanel from './TutorialPreviewPanel.vue'
import TutorialStepGuide from './TutorialStepGuide.vue'
import TutorialStepStatus from './TutorialStepStatus.vue'
import TutorialToolbar from './TutorialToolbar.vue'
import TutorialUnsupportedNotice from './TutorialUnsupportedNotice.vue'
import {
  applyStepCorrections,
  composeStepSnapshot,
  composeVisibleStepSnapshot,
  detectTutorialSupport,
  diffSnapshots,
  getDifferingEditableFiles,
  getPrimaryCorrectionFile,
  mergeTutorialOpenFiles,
  prioritizeTutorialOpenFiles,
  resetStepFiles,
  validateStep,
} from './utils'
import { createTutorialLspProcessTransport } from './utils/tutorialLspProcessTransport'
import { configureTutorialMonacoWorkspace, disposeTutorialMonacoWorkspace } from './utils/tutorialMonacoWorkspace'
import {
  createTutorialServerTracker,
  TUTORIAL_PREVIEW_PORT,
} from './utils/tutorialServerUrls'
import {
  clearTutorialDependencyCache,
  getTutorialDependencyCacheSignature,
  restoreTutorialDependencyCache,
  saveTutorialDependencyCache,
} from './utils/webContainerCache'
import '@directus/vue-split-panel/index.css'

type TutorialStatus = 'idle' | 'booting' | 'installing' | 'starting' | 'ready' | 'syncing' | 'checking' | 'error'

const activeStepIndex = ref(2)
const stepDrafts = ref<Record<string, TutorialSnapshot>>({})
const openFiles = ref<string[]>([])
const selectedFile = ref<string | null>(null)
const validations = ref<Record<string, TutorialValidationResult | null>>({})
const completedStepIds = ref<string[]>([])
const supportState = ref<TutorialSupportState | null>(null)
const status = ref<TutorialStatus>('idle')
const statusMessage = ref('Load the Monaco editor and WebContainer preview when you are ready.')
const logs = ref<string[]>([])
const previewBaseUrl = ref<string | null>(null)
const languageServerTransport = shallowRef<ReturnType<typeof createTutorialLspProcessTransport> | null>(null)
const previewRevision = ref(0)
const previewState = ref<TutorialPreviewState>({})
const correctionOpen = ref(false)
const correctionFile = ref<string | null>(null)
const iframeLoaded = ref(false)
const isWideViewport = ref(false)
const guidePaneSizeHorizontal = useLocalStorage('guidePaneSizeHorizontal', 35)
const guidePaneSizeVertical = useLocalStorage('guidePaneSizeVertical', 35)

const previewFrame = ref<HTMLIFrameElement | null>(null)
const webContainer = shallowRef<WebContainer | null>(null)
const containerSnapshot = shallowRef<TutorialSnapshot>({})

const requestResolvers = new Map<string, { resolve: (value: any) => void, reject: (reason?: unknown) => void, timeout: number }>()
const writeTimers = new Map<string, number>()
const queuedWrites = new Map<string, string>()
const pendingWrites = new Map<string, Promise<void>>()
const processPipes: Array<Promise<void>> = []

const currentStep = computed(() => tutorialSteps[activeStepIndex.value]!)

const currentDraft = computed(() => stepDrafts.value[currentStep.value.id] ?? {})

const currentEditableFiles = computed(() => currentStep.value.editableFiles)

const currentEditorFiles = computed(() =>
  prioritizeTutorialOpenFiles(openFiles.value, currentEditableFiles.value),
)

const currentSelectedFile = computed(() =>
  selectedFile.value && currentEditorFiles.value.includes(selectedFile.value)
    ? selectedFile.value
    : currentEditableFiles.value[0] ?? currentEditorFiles.value[0] ?? null,
)

const currentFileEditable = computed(() =>
  currentSelectedFile.value ? currentEditableFiles.value.includes(currentSelectedFile.value) : false,
)

const currentValidation = computed(() => validations.value[currentStep.value.id] ?? null)

const correctionFiles = computed(() =>
  getDifferingEditableFiles(currentStep.value, currentDraft.value),
)

const currentEditorSnapshot = computed(() =>
  composeVisibleStepSnapshot(currentStep.value, currentDraft.value, currentEditorFiles.value),
)

const currentCorrectionSnapshot = computed(() =>
  composeVisibleStepSnapshot(currentStep.value, currentDraft.value, correctionFiles.value),
)

const previewSrc = computed(() =>
  previewBaseUrl.value ? `${previewBaseUrl.value}?tutorial=${previewRevision.value}` : null,
)

const canGoBack = computed(() => activeStepIndex.value > 0)

const canGoForward = computed(() => activeStepIndex.value < tutorialSteps.length - 1)

const isBusy = computed(() =>
  ['booting', 'installing', 'starting', 'syncing', 'checking'].includes(status.value),
)

const splitPanelOrientation = computed(() => isWideViewport.value ? 'horizontal' : 'vertical')

const guidePaneSize = computed({
  get: () => splitPanelOrientation.value === 'horizontal'
    ? guidePaneSizeHorizontal.value
    : guidePaneSizeVertical.value,
  set: (size: number) => {
    if (splitPanelOrientation.value === 'horizontal') {
      guidePaneSizeHorizontal.value = size
    }
    else {
      guidePaneSizeVertical.value = size
    }
  },
})

const splitPanelUi = {
  start: 'min-w-0 min-h-0',
  divider: 'bg-transparent',
  end: 'min-w-0 min-h-0',
}

let viewportQuery: MediaQueryList | null = null

function syncViewportLayout() {
  isWideViewport.value = viewportQuery?.matches ?? false
}

watch([languageServerTransport, webContainer], async ([transport, instance]) => {
  try {
    await configureTutorialMonacoWorkspace({
      languageServerTransport: transport,
      readFile: instance
        ? async (filePath) => {
          try {
            return await instance.fs.readFile(filePath, 'utf8')
          }
          catch {
            return null
          }
        }
        : null,
    })
  }
  catch (error) {
    appendLog(`[lsp] ${String(error)}`)
    setStatus('error', error instanceof Error ? error.message : String(error))
  }
}, { immediate: true })

function appendLog(message: string) {
  const nextLines = message
    .split('\n')
    .map(line => line.trimEnd())
    .filter(Boolean)

  if (!nextLines.length)
    return

  logs.value = [...logs.value, ...nextLines].slice(-240)
}

function setStatus(nextStatus: TutorialStatus, message: string) {
  status.value = nextStatus
  statusMessage.value = message
}

function getStepSnapshot(step = currentStep.value, draft = stepDrafts.value[step.id] ?? {}) {
  return composeStepSnapshot(step, draft)
}

function ensureStepDraft(step: TutorialStep) {
  if (stepDrafts.value[step.id])
    return

  stepDrafts.value = {
    ...stepDrafts.value,
    [step.id]: resetStepFiles(step),
  }
}

function ensureSelectedFile(step: TutorialStep) {
  openFiles.value = mergeTutorialOpenFiles(openFiles.value, step.editableFiles)
  const current = selectedFile.value

  if (current && step.editableFiles.includes(current))
    return

  selectedFile.value = step.editableFiles[0] ?? openFiles.value[0] ?? null
}

function ensureCurrentStepState(step = currentStep.value) {
  ensureStepDraft(step)
  ensureSelectedFile(step)
}

function markStepDirty(stepId: string) {
  completedStepIds.value = completedStepIds.value.filter(id => id !== stepId)
  validations.value = {
    ...validations.value,
    [stepId]: null,
  }

  if (status.value === 'ready' || status.value === 'error') {
    setStatus('ready', 'Edits detected. The preview is updating with your latest code.')
  }
}

function setCurrentFile(filePath: string) {
  selectedFile.value = filePath
}

function handleEditorChange({ filePath, value }: { filePath: string, value: string }) {
  updateCurrentDraft(filePath, value)
}

function updateCurrentDraft(filePath: string, content: string) {
  const step = currentStep.value
  if (!step.editableFiles.includes(filePath))
    return

  if ((currentDraft.value[filePath] ?? step.starterFiles[filePath] ?? '') === content)
    return

  const nextDraft = {
    ...currentDraft.value,
    [filePath]: content,
  }

  stepDrafts.value = {
    ...stepDrafts.value,
    [step.id]: nextDraft,
  }

  markStepDirty(step.id)

  if (webContainer.value) {
    scheduleWrite(filePath, content)
  }
}

function scheduleWrite(filePath: string, content: string) {
  if (!webContainer.value)
    return

  queuedWrites.set(filePath, content)

  const timer = writeTimers.get(filePath)
  if (timer) {
    window.clearTimeout(timer)
  }

  const timeout = window.setTimeout(() => {
    writeTimers.delete(filePath)
    void writeToContainer(filePath)
  }, 800)

  writeTimers.set(filePath, timeout)
}

function writeToContainer(filePath: string) {
  const instance = webContainer.value
  const content = queuedWrites.get(filePath)

  if (!instance || content == null)
    return Promise.resolve()

  queuedWrites.delete(filePath)
  const promise = instance.fs.writeFile(filePath, content)
  pendingWrites.set(filePath, promise)

  promise
    .then(() => {
      containerSnapshot.value = {
        ...containerSnapshot.value,
        [filePath]: content,
      }
    })
    .catch((error) => {
      appendLog(`[write] ${String(error)}`)
    })
    .finally(() => {
      if (pendingWrites.get(filePath) === promise) {
        pendingWrites.delete(filePath)
      }
    })

  return promise
}

async function flushPendingWrites() {
  const queuedPaths = [...writeTimers.keys()]

  for (const filePath of queuedPaths) {
    const timeout = writeTimers.get(filePath)
    if (timeout) {
      window.clearTimeout(timeout)
      writeTimers.delete(filePath)
    }
  }

  if (queuedPaths.length) {
    await Promise.all(queuedPaths.map(filePath => writeToContainer(filePath)))
  }

  if (pendingWrites.size) {
    await Promise.all([...pendingWrites.values()])
  }
}

function buildFileTree(snapshot: TutorialSnapshot): FileSystemTree {
  const tree: FileSystemTree = {}

  for (const [filePath, contents] of Object.entries(snapshot)) {
    const segments = filePath.split('/')
    let pointer = tree

    for (const segment of segments.slice(0, -1)) {
      const entry = pointer[segment] as { directory?: FileSystemTree } | undefined
      if (!entry?.directory) {
        pointer[segment] = {
          directory: {},
        }
      }
      pointer = (pointer[segment] as { directory: FileSystemTree }).directory
    }

    pointer[segments.at(-1)!] = {
      file: {
        contents,
      },
    }
  }

  return tree
}

function attachProcessOutput(stream: ReadableStream<string>, label: string) {
  const pipe = stream.pipeTo(new WritableStream({
    write(chunk) {
      appendLog(`[${label}] ${chunk}`)
    },
  })).catch((error) => {
    appendLog(`[${label}] ${String(error)}`)
  })

  processPipes.push(pipe)
}

async function installContainerDependencies(instance: WebContainer) {
  setStatus('installing', 'Installing the sandbox dependencies…')
  appendLog('$ npm install')

  const installProcess = await instance.spawn('npm', ['install'])
  attachProcessOutput(installProcess.output, 'npm')
  const installExitCode = await installProcess.exit

  if (installExitCode !== 0) {
    throw new Error('`npm install` failed inside the WebContainer.')
  }
}

async function startPreviewDevServer(instance: WebContainer) {
  setStatus('starting', 'Starting the tutorial preview…')
  appendLog('$ npm run dev')

  const devProcess = await instance.spawn('npm', ['run', 'dev'])
  attachProcessOutput(devProcess.output, 'dev')
  devProcess.exit.then((code) => {
    appendLog(`[dev] process exited with code ${String(code)}`)
  }).catch((error) => {
    appendLog(`[dev] ${String(error)}`)
  })

  return devProcess
}

async function startLanguageServer(instance: WebContainer) {
  setStatus('starting', 'Starting the editor language server…')
  appendLog('$ node scripts/lsp-server.mjs')

  const lspProcess = await instance.spawn('node', ['scripts/lsp-server.mjs'])
  lspProcess.exit.then((code) => {
    appendLog(`[lsp] process exited with code ${String(code)}`)
  }).catch((error) => {
    appendLog(`[lsp] ${String(error)}`)
  })

  return lspProcess
}

async function waitForServerPort(
  serverReady: Promise<string>,
  process: Awaited<ReturnType<typeof startPreviewDevServer>>,
  label: string,
  timeout = 20000,
) {
  return Promise.race([
    serverReady,
    process.exit.then((code) => {
      const details = code === 0
        ? `\`${label}\` exited before its server became ready.`
        : `\`${label}\` exited with code ${String(code)} before its server became ready.`

      throw new Error(details)
    }),
    new Promise<string>((_, reject) => {
      window.setTimeout(() => reject(new Error(`The ${label} server did not become ready in time.`)), timeout)
    }),
  ])
}

async function stopProcess(process: Awaited<ReturnType<typeof startPreviewDevServer>> | null) {
  if (!process) {
    return
  }

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

async function removeContainerDependencies(instance: WebContainer) {
  try {
    await instance.fs.rm('node_modules', {
      recursive: true,
      force: true,
    })
  }
  catch (error) {
    appendLog(`[cache] ${String(error)}`)
  }
}

async function persistDependencyCache(instance: WebContainer, dependencySignature: string) {
  try {
    appendLog('$ caching node_modules for later runs')
    const saved = await saveTutorialDependencyCache(instance, dependencySignature)

    if (saved) {
      appendLog('$ cached sandbox dependencies for later runs')
    }
  }
  catch (error) {
    appendLog(`[cache] ${String(error)}`)
  }
}

async function installAndPersistContainerDependencies(
  instance: WebContainer,
  dependencySignature: string | null,
) {
  await installContainerDependencies(instance)

  if (!dependencySignature) {
    return
  }

  setStatus('installing', 'Caching sandbox dependencies…')
  await persistDependencyCache(instance, dependencySignature)
}

async function applySnapshotToContainer(snapshot: TutorialSnapshot) {
  if (!webContainer.value)
    return

  const instance = webContainer.value
  const { writes, removals } = diffSnapshots(containerSnapshot.value, snapshot)
  const writePaths = Object.keys(writes)

  console.log('[tutorial] apply snapshot diff', {
    writes: writePaths,
    removals,
  })

  for (const filePath of removals) {
    console.log('[tutorial] removing synced file:', filePath)
    await instance.fs.rm(filePath, {
      force: true,
      recursive: true,
    })
  }

  for (const [filePath, contents] of Object.entries(writes)) {
    const directory = filePath.split('/').slice(0, -1).join('/')

    if (directory) {
      await instance.fs.mkdir(directory, {
        recursive: true,
      })
    }

    console.log('[tutorial] syncing file:', filePath)
    await instance.fs.writeFile(filePath, contents)
  }

  containerSnapshot.value = snapshot
  console.log('[tutorial] snapshot sync complete', {
    syncedCount: writePaths.length,
    removedCount: removals.length,
  })
}

function reloadPreview() {
  if (!previewBaseUrl.value)
    return

  iframeLoaded.value = false
  previewState.value = {}
  previewRevision.value += 1
}

function isPreviewBooted(state: TutorialPreviewState) {
  return state.booted === true || typeof state.lastError === 'string'
}

async function waitForPreviewState(
  options: {
    timeout?: number
    predicate?: (state: TutorialPreviewState) => boolean
  } = {},
) {
  const {
    timeout = 20000,
    predicate,
  } = options
  const deadline = Date.now() + timeout
  let lastError: unknown = null

  while (Date.now() < deadline) {
    try {
      const state = await requestPreviewState()
      previewState.value = state

      if (!predicate || predicate(state)) {
        return state
      }
    }
    catch (error) {
      lastError = error
    }

    await new Promise(resolve => window.setTimeout(resolve, 250))
  }

  throw new Error(lastError instanceof Error ? lastError.message : 'The preview did not respond in time.')
}

function cleanupRequests() {
  for (const { reject, timeout } of requestResolvers.values()) {
    window.clearTimeout(timeout)
    reject(new Error('The preview request was cancelled.'))
  }
  requestResolvers.clear()
}

function clearScheduledWrites() {
  for (const timeout of writeTimers.values()) {
    window.clearTimeout(timeout)
  }

  writeTimers.clear()
  queuedWrites.clear()
  pendingWrites.clear()
}

async function stopTutorialRuntime() {
  cleanupRequests()
  clearScheduledWrites()

  const instance = webContainer.value
  webContainer.value = null
  containerSnapshot.value = {}
  previewBaseUrl.value = null
  languageServerTransport.value = null
  previewState.value = {}
  iframeLoaded.value = false

  if (instance) {
    await instance.teardown()
  }

  const pipes = processPipes.splice(0, processPipes.length)
  if (pipes.length) {
    await Promise.allSettled(pipes)
  }
}

async function requestPreviewState(): Promise<TutorialPreviewState> {
  const response = await sendPreviewRequest('get-state')
  return response.state as TutorialPreviewState
}

async function runPreviewAction(action: string): Promise<TutorialPreviewState> {
  const response = await sendPreviewRequest('run-action', { action })

  if (!response.ok) {
    throw new Error(response.error ?? `The preview action "${action}" failed.`)
  }

  return response.state as TutorialPreviewState
}

function sendPreviewRequest(type: 'get-state' | 'run-action', payload: Record<string, unknown> = {}) {
  if (!previewFrame.value?.contentWindow) {
    return Promise.reject(new Error('The preview iframe is not ready yet.'))
  }

  const requestId = crypto.randomUUID()

  return new Promise<any>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      requestResolvers.delete(requestId)
      reject(new Error('The preview request timed out.'))
    }, 8000)

    requestResolvers.set(requestId, {
      resolve,
      reject,
      timeout,
    })

    previewFrame.value?.contentWindow?.postMessage({
      source: 'rstore-docs-tutorial',
      type,
      requestId,
      ...payload,
    }, '*')
  })
}

function handlePreviewMessage(event: MessageEvent) {
  const message = event.data
  if (!message || message.source !== 'rstore-tutorial-preview')
    return

  if (message.type === 'state-updated' && message.state) {
    const state = message.state as TutorialPreviewState
    previewState.value = state

    if (!currentStep.value.validationAction) {
      const result = validateStep(currentStep.value, state)

      if (result.ok) {
        validations.value = {
          ...validations.value,
          [currentStep.value.id]: result,
        }
        completedStepIds.value = [...new Set([...completedStepIds.value, currentStep.value.id])]
        setStatus('ready', `“${currentStep.value.title}” passed.`)
      }
    }
  }

  if (message.requestId && requestResolvers.has(message.requestId)) {
    const entry = requestResolvers.get(message.requestId)!
    requestResolvers.delete(message.requestId)
    window.clearTimeout(entry.timeout)

    if (message.state) {
      previewState.value = message.state as TutorialPreviewState
    }

    entry.resolve(message)
  }
}

async function startTutorial() {
  if (isBusy.value)
    return

  if (!supportState.value?.supported) {
    setStatus('error', supportState.value?.reason ?? 'The browser cannot run WebContainers on this page.')
    return
  }

  try {
    ensureCurrentStepState()

    if (webContainer.value) {
      appendLog('$ stopping previous WebContainer runtime')
      await stopTutorialRuntime()
    }

    logs.value = []

    setStatus('booting', 'Booting the in-browser runtime…')
    appendLog('$ WebContainer.boot()')

    const [{ WebContainer }] = await Promise.all([
      import('@webcontainer/api'),
    ])

    const instance = await WebContainer.boot({
      coep: 'require-corp',
      forwardPreviewErrors: true,
      workdirName: 'tutorial',
    })

    let serverTracker = createTutorialServerTracker()
    instance.on('server-ready', (port, url) => {
      serverTracker.markReady(port, url)
    })

    instance.on('preview-message', (message: unknown) => {
      appendLog(`[preview] ${JSON.stringify(message)}`)
    })

    webContainer.value = instance
    const initialSnapshot = getStepSnapshot()
    console.log('[tutorial] mounting initial snapshot', {
      stepId: currentStep.value.id,
      fileCount: Object.keys(initialSnapshot).length,
    })
    await instance.mount(buildFileTree(initialSnapshot))
    containerSnapshot.value = initialSnapshot

    const dependencySignature = getTutorialDependencyCacheSignature(initialSnapshot)
    let restoredDependenciesFromCache = false

    if (dependencySignature) {
      setStatus('installing', 'Restoring cached sandbox dependencies…')
      appendLog('$ restoring cached node_modules')

      const restoreResult = await restoreTutorialDependencyCache(instance, dependencySignature)

      if (restoreResult === 'hit') {
        restoredDependenciesFromCache = true
        appendLog('$ restored cached tutorial dependencies')
      }
      else if (restoreResult === 'stale') {
        appendLog('$ dependency cache was stale; reinstalling packages')
      }
      else if (restoreResult === 'unsupported') {
        appendLog('$ dependency cache is unavailable in this browser')
      }
    }

    if (!restoredDependenciesFromCache) {
      await installAndPersistContainerDependencies(instance, dependencySignature)
    }

    let lspProcess: Awaited<ReturnType<typeof startLanguageServer>> | null = null
    let devProcess: Awaited<ReturnType<typeof startPreviewDevServer>> | null = null
    let previewUrl: string

    const startServers = async () => {
      lspProcess = await startLanguageServer(instance)
      languageServerTransport.value = createTutorialLspProcessTransport(lspProcess)
      devProcess = await startPreviewDevServer(instance)
      return waitForServerPort(
        serverTracker.waitFor(TUTORIAL_PREVIEW_PORT),
        devProcess,
        'npm run dev',
      )
    }

    try {
      previewUrl = await startServers()
    }
    catch (error) {
      if (!restoredDependenciesFromCache) {
        throw error
      }

      appendLog('$ cached dependencies failed to boot; reinstalling packages')
      await clearTutorialDependencyCache().catch(() => null)

      languageServerTransport.value = null
      await stopProcess(lspProcess)
      await stopProcess(devProcess)

      await removeContainerDependencies(instance)
      await installAndPersistContainerDependencies(instance, dependencySignature)

      serverTracker = createTutorialServerTracker()
      previewUrl = await startServers()
      restoredDependenciesFromCache = false
    }

    previewBaseUrl.value = previewUrl
    reloadPreview()
    await waitForPreviewState({
      predicate: isPreviewBooted,
    })

    setStatus('ready', 'The tutorial is ready. Edit the files, run the preview, and check your work.')
    await checkStep({
      reload: false,
    })
  }
  catch (error) {
    setStatus('error', error instanceof Error ? error.message : String(error))
    appendLog(String(error))
  }
}

async function syncCurrentStepToContainer(options: { reload?: boolean } = {}) {
  if (!webContainer.value)
    return

  try {
    const targetSnapshot = getStepSnapshot()
    console.log('[tutorial] sync current step start', {
      stepId: currentStep.value.id,
      reload: Boolean(options.reload),
      targetFileCount: Object.keys(targetSnapshot).length,
    })
    setStatus('syncing', `Syncing files for “${currentStep.value.title}”…`)
    await flushPendingWrites()
    await applySnapshotToContainer(targetSnapshot)

    if (options.reload) {
      console.log('[tutorial] reloading preview after sync', {
        stepId: currentStep.value.id,
      })
      reloadPreview()
      await waitForPreviewState({
        predicate: isPreviewBooted,
      })
    }

    console.log('[tutorial] sync current step done', {
      stepId: currentStep.value.id,
    })
    setStatus('ready', 'The preview is ready. Edit the files, run the preview, and check your work.')
  }
  catch (error) {
    setStatus('error', error instanceof Error ? error.message : String(error))
  }
}

async function checkStep(options: { reload?: boolean } = {}) {
  const { reload = true } = options
  ensureCurrentStepState()

  if (!webContainer.value) {
    await startTutorial()
  }

  if (!webContainer.value) {
    return
  }

  try {
    setStatus('checking', `Checking “${currentStep.value.title}”…`)
    await flushPendingWrites()

    if (reload) {
      await syncCurrentStepToContainer({
        reload: true,
      })
    }

    await waitForPreviewState({
      predicate: isPreviewBooted,
    })

    let state = await requestPreviewState()

    if (currentStep.value.validationAction) {
      state = await runPreviewAction(currentStep.value.validationAction)
    }

    let result = validateStep(currentStep.value, state)

    if (!result.ok && !currentStep.value.validationAction && !state.lastError) {
      const retryDeadline = Date.now() + 2500

      while (Date.now() < retryDeadline && !result.ok) {
        await new Promise(resolve => window.setTimeout(resolve, 200))
        state = await requestPreviewState()
        result = validateStep(currentStep.value, state)
      }
    }

    validations.value = {
      ...validations.value,
      [currentStep.value.id]: result,
    }

    console.log('Validation result:', result)

    if (result.ok) {
      completedStepIds.value = [...new Set([...completedStepIds.value, currentStep.value.id])]
      setStatus('ready', `“${currentStep.value.title}” passed.`)
    }
    else {
      completedStepIds.value = completedStepIds.value.filter(id => id !== currentStep.value.id)
      setStatus('ready', `Step “${currentStep.value.title}” still needs work.`)
    }
  }
  catch (error) {
    const result: TutorialValidationResult = {
      ok: false,
      summary: 'The preview could not be validated.',
      details: [error instanceof Error ? error.message : String(error)],
      failingFiles: currentStep.value.editableFiles,
    }

    validations.value = {
      ...validations.value,
      [currentStep.value.id]: result,
    }

    setStatus('error', result.details[0]!)
  }
}

async function openCorrection() {
  ensureCurrentStepState()
  correctionOpen.value = true
  correctionFile.value = getPrimaryCorrectionFile(currentStep.value, currentDraft.value) ?? currentStep.value.editableFiles[0] ?? null
}

async function applyCorrections() {
  const step = currentStep.value
  const nextDraft = applyStepCorrections(step, currentDraft.value)

  stepDrafts.value = {
    ...stepDrafts.value,
    [step.id]: nextDraft,
  }
  markStepDirty(step.id)

  if (webContainer.value) {
    await syncCurrentStepToContainer({
      reload: true,
    })
    await checkStep({
      reload: false,
    })
  }
}

function closeCorrection() {
  correctionOpen.value = false
}

function goToNextStep() {
  if (!canGoForward.value)
    return

  activeStepIndex.value += 1
}

function goToPreviousStep() {
  if (!canGoBack.value)
    return

  activeStepIndex.value -= 1
}

watch(currentStep, async (step, previousStep) => {
  ensureCurrentStepState(step)

  if (correctionOpen.value) {
    correctionFile.value = getPrimaryCorrectionFile(step, stepDrafts.value[step.id] ?? {}) ?? step.editableFiles[0] ?? null
  }

  if (webContainer.value && previousStep) {
    await syncCurrentStepToContainer({
      reload: true,
    })
    await checkStep({
      reload: false,
    }).catch(() => null)
  }
}, { immediate: true })

onMounted(() => {
  viewportQuery = window.matchMedia('(min-width: 1280px)')
  syncViewportLayout()
  viewportQuery.addEventListener('change', syncViewportLayout)
  supportState.value = detectTutorialSupport(window as Window & typeof globalThis)
  ensureCurrentStepState()
  window.addEventListener('message', handlePreviewMessage)

  if (supportState.value.supported) {
    void startTutorial()
  }
})

onBeforeUnmount(async () => {
  viewportQuery?.removeEventListener('change', syncViewportLayout)
  viewportQuery = null
  window.removeEventListener('message', handlePreviewMessage)
  await stopTutorialRuntime()
  await disposeTutorialMonacoWorkspace()
})
</script>

<template>
  <section class="flex flex-col p-2 gap-2 text-zinc-900 dark:text-zinc-100 fixed inset-0 top-16 z-31 bg-(--vp-c-bg)">
    <TutorialUnsupportedNotice
      v-if="supportState && !supportState.supported"
      :reason="supportState.reason"
      :needs-cross-origin-isolation="supportState.needsCrossOriginIsolation"
    />

    <template v-else>
      <SplitPanel
        v-model:size="guidePaneSize"
        :orientation="splitPanelOrientation"
        primary="start"
        size-unit="%"
        :snap-points="[35]"
        :min-size="splitPanelOrientation === 'horizontal' ? 28 : 20"
        :max-size="splitPanelOrientation === 'horizontal' ? 72 : 52"
        divider-hit-area="16px"
        :ui="splitPanelUi"
        class="flex-1 min-h-0 [&_.sp-root]:h-full [&_.sp-root.sp-dragging_.tutorial-divider__line]:bg-[color-mix(in_srgb,var(--vp-c-brand-1)_70%,var(--vp-c-divider))]"
      >
        <template #start>
          <section class="flex flex-col h-full gap-2 p-0.5">
            <TutorialToolbar
              :can-go-back="canGoBack"
              :can-go-forward="canGoForward"
              :is-busy="isBusy"
              :step-index="activeStepIndex + 1"
              :total-steps="tutorialSteps.length"
              @previous="goToPreviousStep()"
              @next="goToNextStep()"
              @show-correction="openCorrection()"
            />

            <TutorialStepGuide
              :step="currentStep"
              :can-go-back="canGoBack"
              :can-go-forward="canGoForward"
              :is-busy="isBusy"
              class="flex-1 min-h-0"
              @previous="goToPreviousStep()"
              @next="goToNextStep()"
            />

            <TutorialStepStatus
              :validation="currentValidation"
              :status-message="statusMessage"
              :status="status"
            />
          </section>
        </template>

        <template #divider>
          <div
            class="group flex items-center justify-center"
            :class="splitPanelOrientation === 'horizontal'
              ? 'h-full w-3 cursor-ew-resize'
              : 'h-3 w-full cursor-ns-resize'"
            aria-hidden="true"
          >
            <span
              class="tutorial-divider__line rounded-full bg-[color-mix(in_srgb,var(--vp-c-divider)_85%,transparent)] transition-colors group-hover:bg-[color-mix(in_srgb,var(--vp-c-brand-1)_70%,var(--vp-c-divider))]"
              :class="splitPanelOrientation === 'horizontal'
                ? 'h-full w-px'
                : 'h-px w-full'"
            />
          </div>
        </template>

        <template #end>
          <section class="flex flex-col h-full gap-2 p-0.5">
            <TutorialEditorPanel
              :editable-files="currentEditableFiles"
              :open-files="currentEditorFiles"
              :selected-file="currentSelectedFile"
              :selected-file-editable="currentFileEditable"
              :has-runtime="Boolean(webContainer)"
              class="flex-1 min-h-0"
              @select-file="setCurrentFile($event)"
            >
              <MonacoEditor
                :step-id="currentStep.id"
                :file-path="currentSelectedFile"
                :read-only="!currentFileEditable"
                :project-files="currentEditorSnapshot"
                class="min-h-0 flex-1"
                @change="handleEditorChange($event)"
              />
            </TutorialEditorPanel>

            <TutorialPreviewPanel
              :list-count="previewState.listCount ?? 0"
              :preview-base-url="previewBaseUrl"
              :preview-src="previewSrc"
              :last-error="status === 'error' || previewState.lastError ? (previewState.lastError ?? logs.at(-1) ?? 'The preview could not start.') : null"
              :logs="logs"
              :web-container="webContainer"
              class="flex-1 min-h-0"
              @reload="reloadPreview()"
            >
              <template #default>
                <iframe
                  ref="previewFrame"
                  :src="previewSrc ?? undefined"
                  class="block size-full bg-(--vp-c-bg) rounded-lg overflow-hidden"
                  allow="cross-origin-isolated; clipboard-read; clipboard-write"
                  title="Interactive tutorial preview"
                  @load="iframeLoaded = true"
                />
              </template>
            </TutorialPreviewPanel>
          </section>
        </template>
      </SplitPanel>
    </template>

    <TutorialCorrectionDialog
      :open="correctionOpen"
      :step-title="currentStep.title"
      :correction-files="correctionFiles"
      :selected-file="correctionFile"
      :is-busy="isBusy"
      @close="closeCorrection()"
      @apply="applyCorrections()"
      @select-file="correctionFile = $event"
    >
      <MonacoEditor
        variant="diff"
        :step-id="currentStep.id"
        :file-path="correctionFile"
        :project-files="currentCorrectionSnapshot"
        :solution-files="currentStep.solutionFiles"
        class="min-h-[34rem] flex-1 overflow-hidden"
      />
    </TutorialCorrectionDialog>
  </section>
</template>
