<script setup lang="ts">
import type { DirEnt, FileSystemTree, WebContainer } from '@webcontainer/api'
import type { TutorialLogEntry } from './utils/tutorialRuntimeLogs'
import type {
  TutorialChapter,
  TutorialFramework,
  TutorialPreviewState,
  TutorialSnapshot,
  TutorialSupportState,
  TutorialTrackSummary,
  TutorialValidationResult,
} from './utils/types'
import { SplitPanel } from '@directus/vue-split-panel'
import { useLocalStorage } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import MonacoEditor from './MonacoEditor.vue'
import {
  createTutorialFrameworkRecord,
  defaultTutorialFramework,
  getTutorialChapters,
  resolveTutorialFramework,
  tutorialTrackContent,
} from './steps'
import TutorialCorrectionDialog from './TutorialCorrectionDialog.vue'
import TutorialEditorPanel from './TutorialEditorPanel.vue'
import TutorialPreviewPanel from './TutorialPreviewPanel.vue'
import TutorialStepGuide from './TutorialStepGuide.vue'
import TutorialToolbar from './TutorialToolbar.vue'
import TutorialTrackPicker from './TutorialTrackPicker.vue'
import TutorialUnsupportedNotice from './TutorialUnsupportedNotice.vue'
import {
  applyStepCorrections,
  composeStepSnapshot,
  composeVisibleStepSnapshot,
  detectTutorialSupport,
  getAdjacentTutorialChapters,
  getDifferingEditableFiles,
  getPrimaryCorrectionFile,
  getTutorialChapterEditorFiles,
  groupTutorialChapters,
  isTutorialPreviewSessionCurrent,
  planTutorialExactSync,
  resetStepFiles,
  resolveTutorialChapterSelectedFile,
  resolveTutorialSelectedFile,
  validateStep,
} from './utils'
import {
  createTutorialDependencyInstallPlan,
} from './utils/tutorialDependencyInstall'
import { createTutorialLspProcessTransport } from './utils/tutorialLspProcessTransport'
import { configureTutorialMonacoWorkspace, disposeTutorialMonacoWorkspace } from './utils/tutorialMonacoWorkspace'
import {
  appendTutorialLogMessage,
  appendTutorialRuntimeOutputChunk,
} from './utils/tutorialRuntimeLogs'
import {
  createTutorialChapterTaskSessionController,
  createTutorialRuntimeSessionController,
  isTutorialChapterTaskCancellationError,
  isTutorialRuntimeCancellationError,
  TutorialChapterTaskCancellationError,
} from './utils/tutorialRuntimeSession'
import {
  createTutorialServerTracker,
  getTutorialRuntimeProfile,
} from './utils/tutorialServerUrls'
import {
  clearTutorialDependencyCache,
  getTutorialDependencyCacheSignature,
  restoreTutorialDependencyCache,
  saveTutorialDependencyCache,
} from './utils/webContainerCache'
import '@directus/vue-split-panel/index.css'

type TutorialStatus = 'idle' | 'booting' | 'installing' | 'starting' | 'ready' | 'syncing' | 'checking' | 'error'

const storedFramework = useLocalStorage('interactiveTutorialFramework', defaultTutorialFramework)
const resolvedStoredFramework = resolveTutorialFramework(storedFramework.value)
if (storedFramework.value !== resolvedStoredFramework) {
  storedFramework.value = resolvedStoredFramework
}

const selectedFramework = computed<TutorialFramework>({
  get: () => resolveTutorialFramework(storedFramework.value),
  set: (framework) => {
    storedFramework.value = framework
  },
})

const activeChapterIndexes = ref(createTutorialFrameworkRecord(() => 0))
const chapterDraftsByFramework = ref(createTutorialFrameworkRecord<Record<string, TutorialSnapshot>>(() => ({})))
const selectedFilesByFramework = ref(createTutorialFrameworkRecord<Record<string, string | null>>(() => ({})))
const validationsByFramework = ref(createTutorialFrameworkRecord<Record<string, TutorialValidationResult | null>>(() => ({})))
const completedChapterIdsByFramework = ref(createTutorialFrameworkRecord<string[]>(() => []))
const trackOptions = computed<TutorialTrackSummary[]>(() =>
  Object.values(tutorialTrackContent).map(({ chapters, ...track }) => ({
    ...track,
    chapterCount: chapters.length,
  })),
)
const showTrackPicker = ref(true)
const hasSelectedTrack = ref(false)

const supportState = ref<TutorialSupportState | null>(null)
const status = ref<TutorialStatus>('idle')
const statusMessage = ref('Load the Monaco editor and WebContainer preview when you are ready.')
const logs = ref<TutorialLogEntry[]>([])
let nextLogId = 0
const previewBaseUrl = ref<string | null>(null)
const languageServerTransport = shallowRef<ReturnType<typeof createTutorialLspProcessTransport> | null>(null)
const previewRevision = ref(0)
const previewSessionId = ref<string | null>(null)
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
const syncedChapterId = ref<string | null>(null)

const requestResolvers = new Map<string, {
  resolve: (value: any) => void
  reject: (reason?: unknown) => void
  sessionId: string
  timeout: number
}>()
const writeTimers = new Map<string, number>()
const queuedWrites = new Map<string, string>()
const pendingWrites = new Map<string, Promise<void>>()
const processPipes: Array<Promise<void>> = []
let pendingChapterSyncRequest: { token: number } | null = null
let chapterSyncPromise: Promise<void> | null = null
let activeChapterTaskCount = 0
const latestChapterTask = createTutorialChapterTaskSessionController()
const latestRuntimeSession = createTutorialRuntimeSessionController()
const latestSelectedChapterToken = ref(latestChapterTask.issue())
const hasMounted = ref(false)
const tutorialPreservedRootPaths = ['node_modules', '.nuxt', '.output']

const tutorialChapters = computed(() => getTutorialChapters(selectedFramework.value))

const activeChapterIndex = computed({
  get: () => activeChapterIndexes.value[selectedFramework.value],
  set: (value: number) => {
    activeChapterIndexes.value = {
      ...activeChapterIndexes.value,
      [selectedFramework.value]: value,
    }
  },
})

const groupedChapters = computed(() => groupTutorialChapters(tutorialChapters.value))

const currentChapter = computed(() => tutorialChapters.value[activeChapterIndex.value]!)

const currentDraft = computed(() =>
  chapterDraftsByFramework.value[selectedFramework.value][currentChapter.value.id] ?? {},
)

const currentEditableFiles = computed(() => currentChapter.value.editableFiles)

const currentEditorFiles = computed(() => getTutorialChapterEditorFiles(currentChapter.value))

const currentSelectedFile = computed(() =>
  resolveTutorialChapterSelectedFile(
    currentChapter.value.id,
    selectedFilesByFramework.value[selectedFramework.value],
    currentEditorFiles.value,
    currentEditableFiles.value,
  ),
)

const currentFileEditable = computed(() =>
  currentSelectedFile.value ? currentEditableFiles.value.includes(currentSelectedFile.value) : false,
)

const currentValidation = computed(() =>
  validationsByFramework.value[selectedFramework.value][currentChapter.value.id] ?? null,
)

const currentCompletedChapterIds = computed(() =>
  completedChapterIdsByFramework.value[selectedFramework.value],
)

const correctionFiles = computed(() =>
  getDifferingEditableFiles(currentChapter.value, currentDraft.value),
)

const currentEditorSnapshot = computed(() =>
  composeVisibleStepSnapshot(currentChapter.value, currentDraft.value, currentEditorFiles.value),
)

const currentCorrectionSnapshot = computed(() =>
  composeVisibleStepSnapshot(currentChapter.value, currentDraft.value, correctionFiles.value),
)

const previewSrc = computed(() =>
  previewBaseUrl.value && previewSessionId.value
    ? `${previewBaseUrl.value}?tutorial=${previewRevision.value}&session=${encodeURIComponent(previewSessionId.value)}`
    : null,
)

const chapterNavigation = computed(() =>
  getAdjacentTutorialChapters(tutorialChapters.value, activeChapterIndex.value),
)

const previousChapter = computed(() => chapterNavigation.value.previous)

const nextChapter = computed(() => chapterNavigation.value.next)

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
  const result = appendTutorialLogMessage(logs.value, message, nextLogId)
  logs.value = result.logs
  nextLogId = result.nextLogId
}

function setStatus(nextStatus: TutorialStatus, message: string) {
  status.value = nextStatus
  statusMessage.value = message
}

function setStatusForChapter(chapter: TutorialChapter, nextStatus: TutorialStatus, message: string, token?: number) {
  if (currentChapter.value.id !== chapter.id)
    return

  if (token != null && !latestChapterTask.isCurrent(token))
    return

  setStatus(nextStatus, message)
}

function isCurrentChapterTask(token?: number) {
  return token == null || latestChapterTask.isCurrent(token)
}

function isCurrentRuntimeSession(token?: number) {
  return token == null || latestRuntimeSession.isCurrent(token)
}

function throwIfChapterTaskStale(token?: number) {
  if (token == null)
    return

  latestChapterTask.throwIfStale(token)
}

function throwIfRuntimeSessionStale(token?: number) {
  if (token == null)
    return

  latestRuntimeSession.throwIfStale(token)
}

function startChapterTask() {
  activeChapterTaskCount += 1
}

function finishChapterTask() {
  activeChapterTaskCount = Math.max(0, activeChapterTaskCount - 1)
}

function appendLogForRuntime(message: string, token?: number) {
  if (!isCurrentRuntimeSession(token))
    return

  appendLog(message)
}

function setStatusForRuntime(nextStatus: TutorialStatus, message: string, token?: number) {
  if (!isCurrentRuntimeSession(token))
    return

  setStatus(nextStatus, message)
}

function getFrameworkChapterDrafts(framework = selectedFramework.value) {
  return chapterDraftsByFramework.value[framework]
}

function getFrameworkSelectedFiles(framework = selectedFramework.value) {
  return selectedFilesByFramework.value[framework]
}

function getFrameworkSelectedFile(framework = selectedFramework.value, chapterId = currentChapter.value.id) {
  return getFrameworkSelectedFiles(framework)[chapterId] ?? null
}

function getFrameworkCompletedChapterIds(framework = selectedFramework.value) {
  return completedChapterIdsByFramework.value[framework]
}

function setFrameworkDraft(framework: TutorialFramework, chapterId: string, draft: TutorialSnapshot) {
  chapterDraftsByFramework.value = {
    ...chapterDraftsByFramework.value,
    [framework]: {
      ...chapterDraftsByFramework.value[framework],
      [chapterId]: draft,
    },
  }
}

function setFrameworkSelectedFile(framework: TutorialFramework, chapterId: string, filePath: string | null) {
  selectedFilesByFramework.value = {
    ...selectedFilesByFramework.value,
    [framework]: {
      ...selectedFilesByFramework.value[framework],
      [chapterId]: filePath,
    },
  }
}

function setFrameworkValidation(framework: TutorialFramework, chapterId: string, validation: TutorialValidationResult | null) {
  validationsByFramework.value = {
    ...validationsByFramework.value,
    [framework]: {
      ...validationsByFramework.value[framework],
      [chapterId]: validation,
    },
  }
}

function setFrameworkCompletedChapterIds(framework: TutorialFramework, completedChapterIds: string[]) {
  completedChapterIdsByFramework.value = {
    ...completedChapterIdsByFramework.value,
    [framework]: completedChapterIds,
  }
}

function getChapterSnapshot(chapter = currentChapter.value, draft = getFrameworkChapterDrafts(chapter.framework)[chapter.id] ?? {}) {
  return composeStepSnapshot(chapter, draft)
}

function ensureChapterDraft(chapter: TutorialChapter) {
  if (getFrameworkChapterDrafts(chapter.framework)[chapter.id])
    return

  setFrameworkDraft(chapter.framework, chapter.id, resetStepFiles(chapter))
}

function ensureSelectedFile(chapter: TutorialChapter) {
  setFrameworkSelectedFile(chapter.framework, chapter.id, resolveTutorialSelectedFile(
    getFrameworkSelectedFile(chapter.framework, chapter.id),
    getTutorialChapterEditorFiles(chapter),
    chapter.editableFiles,
  ))
}

function ensureCurrentChapterState(chapter = currentChapter.value) {
  ensureChapterDraft(chapter)
  ensureSelectedFile(chapter)
}

function markChapterDirty(chapterId: string) {
  const framework = selectedFramework.value
  setFrameworkCompletedChapterIds(framework, getFrameworkCompletedChapterIds(framework).filter(id => id !== chapterId))
  setFrameworkValidation(framework, chapterId, null)

  if (status.value === 'ready' || status.value === 'error') {
    setStatus('ready', 'Edits detected. The preview is updating with your latest code.')
  }
}

function setCurrentFile(filePath: string) {
  setFrameworkSelectedFile(selectedFramework.value, currentChapter.value.id, filePath)
}

function handleEditorChange({ filePath, value }: { filePath: string, value: string }) {
  updateCurrentDraft(filePath, value)
}

function updateCurrentDraft(filePath: string, content: string) {
  const chapter = currentChapter.value
  if (!chapter.editableFiles.includes(filePath))
    return

  if ((currentDraft.value[filePath] ?? chapter.starterFiles[filePath] ?? '') === content)
    return

  const nextDraft = {
    ...currentDraft.value,
    [filePath]: content,
  }

  setFrameworkDraft(chapter.framework, chapter.id, nextDraft)

  markChapterDirty(chapter.id)

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

async function flushPendingWrites(token?: number) {
  throwIfChapterTaskStale(token)
  const queuedPaths = [...writeTimers.keys()]

  for (const filePath of queuedPaths) {
    throwIfChapterTaskStale(token)
    const timeout = writeTimers.get(filePath)
    if (timeout) {
      window.clearTimeout(timeout)
      writeTimers.delete(filePath)
    }
  }

  if (queuedPaths.length) {
    await Promise.all(queuedPaths.map(filePath => writeToContainer(filePath)))
    throwIfChapterTaskStale(token)
  }

  if (pendingWrites.size) {
    await Promise.all([...pendingWrites.values()])
    throwIfChapterTaskStale(token)
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

function attachProcessOutput(stream: ReadableStream<string>, label: string, token?: number) {
  let activeEntryId: number | null = null
  let currentLine = ''

  const pipe = stream.pipeTo(new WritableStream({
    write(chunk) {
      if (!isCurrentRuntimeSession(token))
        return

      const result = appendTutorialRuntimeOutputChunk(logs.value, {
        activeEntryId,
        chunk,
        currentLine,
        label,
        nextLogId,
      })

      logs.value = result.logs
      nextLogId = result.nextLogId
      activeEntryId = result.activeEntryId
      currentLine = result.currentLine
    },
  })).catch((error) => {
    appendLogForRuntime(`[${label}] ${String(error)}`, token)
  })

  processPipes.push(pipe)
}

async function installContainerDependencies(instance: WebContainer, snapshot: TutorialSnapshot, token?: number) {
  setStatusForRuntime('installing', 'Installing the sandbox dependencies…', token)
  const installPlan = createTutorialDependencyInstallPlan(snapshot)
  let installProcess = await instance.spawn('npm', installPlan.primary.args)
  appendLogForRuntime(`$ ${installPlan.primary.label}`, token)
  attachProcessOutput(installProcess.output, 'npm', token)

  let installExitCode = await installProcess.exit

  if (installExitCode === 0) {
    return
  }

  if (!installPlan.fallback) {
    throw new Error(`\`${installPlan.primary.label}\` failed inside the WebContainer.`)
  }

  appendLogForRuntime(`$ ${installPlan.primary.label} failed; retrying with ${installPlan.fallback.label}`, token)
  await removeContainerDependencies(instance)
  installProcess = await instance.spawn('npm', installPlan.fallback.args)
  appendLogForRuntime(`$ ${installPlan.fallback.label}`, token)
  attachProcessOutput(installProcess.output, 'npm', token)
  installExitCode = await installProcess.exit

  if (installExitCode !== 0) {
    throw new Error(`\`${installPlan.fallback.label}\` failed inside the WebContainer.`)
  }
}

async function startPreviewDevServer(instance: WebContainer, token?: number) {
  setStatusForRuntime('starting', 'Starting the tutorial preview…', token)
  appendLogForRuntime('$ npm run dev', token)

  const devProcess = await instance.spawn('npm', ['run', 'dev'])
  attachProcessOutput(devProcess.output, 'dev', token)
  devProcess.exit.then((code) => {
    appendLogForRuntime(`[dev] process exited with code ${String(code)}`, token)
  }).catch((error) => {
    appendLogForRuntime(`[dev] ${String(error)}`, token)
  })

  return devProcess
}

async function waitForLanguageServerDependencies(instance: WebContainer, timeout = 10000, token?: number) {
  const requiredFiles = [
    'node_modules/@vue/language-server/package.json',
    'node_modules/typescript-language-server/lib/cli.mjs',
    'node_modules/typescript/lib/typescript.js',
  ]
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    throwIfRuntimeSessionStale(token)

    const ready = await Promise.all(requiredFiles.map(async (filePath) => {
      try {
        await instance.fs.readFile(filePath, 'utf8')
        return true
      }
      catch {
        return false
      }
    }))

    if (ready.every(Boolean)) {
      return
    }

    await new Promise(resolve => window.setTimeout(resolve, 100))
  }

  throw new Error('The tutorial editor dependencies did not finish mounting in time.')
}

async function startLanguageServer(instance: WebContainer, token?: number) {
  setStatusForRuntime('starting', 'Starting the editor language server…', token)
  appendLogForRuntime('$ node scripts/lsp-server.mjs', token)

  const lspProcess = await instance.spawn('node', ['scripts/lsp-server.mjs'])
  lspProcess.exit.then((code) => {
    appendLogForRuntime(`[lsp] process exited with code ${String(code)}`, token)
  }).catch((error) => {
    appendLogForRuntime(`[lsp] ${String(error)}`, token)
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

async function persistDependencyCache(instance: WebContainer, dependencySignature: string, token?: number) {
  try {
    appendLogForRuntime('$ caching node_modules for later runs', token)
    const saved = await saveTutorialDependencyCache(instance, dependencySignature)

    if (saved) {
      appendLogForRuntime('$ cached sandbox dependencies for later runs', token)
    }
  }
  catch (error) {
    appendLogForRuntime(`[cache] ${String(error)}`, token)
  }
}

async function listContainerWorkspaceEntries(
  instance: WebContainer,
  directoryPath = '.',
  relativeDirectoryPath = '',
  token?: number,
): Promise<{ directories: string[], files: string[] }> {
  throwIfChapterTaskStale(token)
  const entries = await instance.fs.readdir(directoryPath, {
    withFileTypes: true,
  })
  const directories: string[] = []
  const files: string[] = []

  for (const entry of entries as DirEnt<string>[]) {
    throwIfChapterTaskStale(token)
    const childPath = relativeDirectoryPath
      ? `${relativeDirectoryPath}/${entry.name}`
      : entry.name

    if (tutorialPreservedRootPaths.includes(childPath)) {
      continue
    }

    if (entry.isDirectory()) {
      directories.push(childPath)
      const nestedEntries = await listContainerWorkspaceEntries(instance, childPath, childPath, token)
      directories.push(...nestedEntries.directories)
      files.push(...nestedEntries.files)
      continue
    }

    if (entry.isFile()) {
      files.push(childPath)
    }
  }

  return {
    directories,
    files,
  }
}

async function applyProjectSnapshotToContainer(snapshot: TutorialSnapshot, token?: number) {
  if (!webContainer.value)
    return

  throwIfChapterTaskStale(token)
  const instance = webContainer.value
  const workspaceListing = await listContainerWorkspaceEntries(instance, '.', '', token)
  const {
    writes,
    fileRemovals,
    directoryRemovals,
  } = planTutorialExactSync(
    containerSnapshot.value,
    workspaceListing,
    snapshot,
    {
      preservedRootPaths: tutorialPreservedRootPaths,
    },
  )
  const writePaths = Object.keys(writes)

  console.log('[tutorial] apply exact snapshot diff', {
    writes: writePaths,
    fileRemovals,
    directoryRemovals,
  })

  for (const directoryPath of directoryRemovals) {
    throwIfChapterTaskStale(token)
    console.log('[tutorial] removing synced directory:', directoryPath)
    await instance.fs.rm(directoryPath, {
      force: true,
      recursive: true,
    })
  }

  for (const filePath of fileRemovals) {
    throwIfChapterTaskStale(token)
    console.log('[tutorial] removing synced file:', filePath)
    await instance.fs.rm(filePath, {
      force: true,
      recursive: true,
    })
  }

  for (const [filePath, contents] of Object.entries(writes)) {
    throwIfChapterTaskStale(token)
    const directory = filePath.split('/').slice(0, -1).join('/')

    if (directory) {
      await instance.fs.mkdir(directory, {
        recursive: true,
      })
    }

    console.log('[tutorial] syncing file:', filePath)
    await instance.fs.writeFile(filePath, contents)
  }

  containerSnapshot.value = {
    ...snapshot,
  }
  console.log('[tutorial] exact snapshot sync complete', {
    syncedCount: writePaths.length,
    removedFileCount: fileRemovals.length,
    removedDirectoryCount: directoryRemovals.length,
  })
}

function reloadPreview() {
  if (!previewBaseUrl.value)
    return

  cleanupRequests('The preview reloaded.')
  iframeLoaded.value = false
  previewState.value = {}
  previewSessionId.value = crypto.randomUUID()
  previewRevision.value += 1
}

function isPreviewBooted(state: TutorialPreviewState) {
  return state.booted === true || typeof state.lastError === 'string'
}

async function waitForPreviewState(
  options: {
    timeout?: number
    predicate?: (state: TutorialPreviewState) => boolean
    previewSessionId?: string
    runtimeToken?: number
    chapterTaskToken?: number
  } = {},
) {
  const {
    timeout = 20000,
    predicate,
    previewSessionId: targetPreviewSessionId = previewSessionId.value,
    runtimeToken,
    chapterTaskToken,
  } = options
  const deadline = Date.now() + timeout
  let lastError: unknown = null

  while (Date.now() < deadline) {
    throwIfRuntimeSessionStale(runtimeToken)
    throwIfChapterTaskStale(chapterTaskToken)

    try {
      const state = await requestPreviewState(targetPreviewSessionId ?? undefined, chapterTaskToken)
      throwIfChapterTaskStale(chapterTaskToken)

      if (isCurrentRuntimeSession(runtimeToken)) {
        previewState.value = state
      }

      if (!predicate || predicate(state)) {
        return state
      }
    }
    catch (error) {
      if (isTutorialChapterTaskCancellationError(error)) {
        throw error
      }

      lastError = error
    }

    await new Promise(resolve => window.setTimeout(resolve, 250))
  }

  throw new Error(lastError instanceof Error ? lastError.message : 'The preview did not respond in time.')
}

function cleanupRequests(reason: Error | string = 'The preview request was cancelled.') {
  const error = typeof reason === 'string'
    ? new Error(reason)
    : reason

  for (const { reject, timeout } of requestResolvers.values()) {
    window.clearTimeout(timeout)
    reject(error)
  }
  requestResolvers.clear()
}

function cancelChapterTaskRequests() {
  cleanupRequests(new TutorialChapterTaskCancellationError())
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
  pendingChapterSyncRequest = null
  chapterSyncPromise = null

  const instance = webContainer.value
  webContainer.value = null
  containerSnapshot.value = {}
  previewBaseUrl.value = null
  previewSessionId.value = null
  languageServerTransport.value = null
  previewState.value = {}
  syncedChapterId.value = null
  iframeLoaded.value = false

  if (instance) {
    await instance.teardown()
  }

  const pipes = processPipes.splice(0, processPipes.length)
  if (pipes.length) {
    await Promise.allSettled(pipes)
  }
}

async function requestPreviewState(
  sessionId = previewSessionId.value ?? undefined,
  token?: number,
): Promise<TutorialPreviewState> {
  throwIfChapterTaskStale(token)
  const response = await sendPreviewRequest('get-state', {}, sessionId)
  throwIfChapterTaskStale(token)
  return response.state as TutorialPreviewState
}

async function runPreviewAction(action: string, token?: number): Promise<TutorialPreviewState> {
  throwIfChapterTaskStale(token)
  const response = await sendPreviewRequest('run-action', { action })
  throwIfChapterTaskStale(token)

  if (!response.ok) {
    throw new Error(response.error ?? `The preview action "${action}" failed.`)
  }

  return response.state as TutorialPreviewState
}

function sendPreviewRequest(type: 'get-state' | 'run-action', payload: Record<string, unknown> = {}, sessionId = previewSessionId.value ?? undefined) {
  if (!previewFrame.value?.contentWindow) {
    return Promise.reject(new Error('The preview iframe is not ready yet.'))
  }

  if (!sessionId) {
    return Promise.reject(new Error('The preview session is not ready yet.'))
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
      sessionId,
      timeout,
    })

    previewFrame.value?.contentWindow?.postMessage({
      source: 'rstore-docs-tutorial',
      sessionId,
      type,
      requestId,
      ...payload,
    }, '*')
  })
}

function getPreviewOrigin() {
  if (!previewBaseUrl.value)
    return null

  try {
    return new URL(previewBaseUrl.value).origin
  }
  catch {
    return null
  }
}

function handlePreviewMessage(event: MessageEvent) {
  const message = event.data
  if (!message || message.source !== 'rstore-tutorial-preview')
    return

  const previewOrigin = getPreviewOrigin()
  if (!previewOrigin || event.origin !== previewOrigin)
    return

  if (!isTutorialPreviewSessionCurrent(previewSessionId.value, message.sessionId))
    return

  if (message.type === 'state-updated' && message.state) {
    const state = message.state as TutorialPreviewState
    previewState.value = state

    if (syncedChapterId.value === currentChapter.value.id && !currentChapter.value.validationAction) {
      const result = validateStep(currentChapter.value, state)

      if (result.ok) {
        setFrameworkValidation(currentChapter.value.framework, currentChapter.value.id, result)
        setFrameworkCompletedChapterIds(
          currentChapter.value.framework,
          [...new Set([...getFrameworkCompletedChapterIds(currentChapter.value.framework), currentChapter.value.id])],
        )
        setStatus('ready', `“${currentChapter.value.title}” passed.`)
      }
    }
  }

  if (message.requestId && requestResolvers.has(message.requestId)) {
    const entry = requestResolvers.get(message.requestId)!

    if (entry.sessionId !== message.sessionId) {
      return
    }

    requestResolvers.delete(message.requestId)
    window.clearTimeout(entry.timeout)

    if (message.state) {
      previewState.value = message.state as TutorialPreviewState
    }

    entry.resolve(message)
  }
}

async function startTutorial() {
  if (!supportState.value?.supported) {
    setStatus('error', supportState.value?.reason ?? 'The browser cannot run WebContainers on this page.')
    return
  }

  const runtimeToken = latestRuntimeSession.issue()
  let instance: WebContainer | null = null

  try {
    ensureCurrentChapterState()
    const runtimeProfile = getTutorialRuntimeProfile(selectedFramework.value)

    if (webContainer.value) {
      appendLogForRuntime('$ stopping previous WebContainer runtime', runtimeToken)
      await stopTutorialRuntime()
      throwIfRuntimeSessionStale(runtimeToken)
    }

    logs.value = []
    nextLogId = 0

    setStatusForRuntime('booting', 'Booting the in-browser runtime…', runtimeToken)
    appendLogForRuntime('$ WebContainer.boot()', runtimeToken)

    const [{ WebContainer }] = await Promise.all([
      import('@webcontainer/api'),
    ])
    throwIfRuntimeSessionStale(runtimeToken)

    instance = await WebContainer.boot({
      coep: 'require-corp',
      forwardPreviewErrors: true,
      workdirName: 'tutorial',
    })
    throwIfRuntimeSessionStale(runtimeToken)

    let serverTracker = createTutorialServerTracker()
    instance.on('server-ready', (port, url) => {
      if (!isCurrentRuntimeSession(runtimeToken))
        return

      serverTracker.markReady(port, url)
    })

    instance.on('preview-message', (message: unknown) => {
      appendLogForRuntime(`[preview] ${JSON.stringify(message)}`, runtimeToken)
    })

    const runtimeInstance = instance
    webContainer.value = runtimeInstance
    const initialChapter = currentChapter.value
    const baseSnapshot = {
      ...initialChapter.runtimeAssets.frameworkBaseFiles,
    }
    console.log('[tutorial] mounting initial snapshot', {
      chapterId: initialChapter.id,
      fileCount: Object.keys(baseSnapshot).length,
    })
    await runtimeInstance.mount(buildFileTree(baseSnapshot))
    throwIfRuntimeSessionStale(runtimeToken)
    containerSnapshot.value = baseSnapshot

    const dependencySignature = getTutorialDependencyCacheSignature(baseSnapshot)
    let restoredDependenciesFromCache = false
    let shouldPersistDependencies = false

    if (dependencySignature) {
      setStatusForRuntime('installing', 'Restoring cached sandbox dependencies…', runtimeToken)
      appendLogForRuntime('$ restoring cached node_modules', runtimeToken)

      const restoreResult = await restoreTutorialDependencyCache(runtimeInstance, dependencySignature)
      throwIfRuntimeSessionStale(runtimeToken)

      if (restoreResult === 'hit') {
        restoredDependenciesFromCache = true
        appendLogForRuntime('$ restored cached tutorial dependencies', runtimeToken)
      }
      else if (restoreResult === 'stale') {
        appendLogForRuntime('$ dependency cache was stale; reinstalling packages', runtimeToken)
      }
      else if (restoreResult === 'unsupported') {
        appendLogForRuntime('$ dependency cache is unavailable in this browser', runtimeToken)
      }
    }

    if (!restoredDependenciesFromCache) {
      await installContainerDependencies(runtimeInstance, baseSnapshot, runtimeToken)
      throwIfRuntimeSessionStale(runtimeToken)
      shouldPersistDependencies = Boolean(dependencySignature)
    }

    let lspProcess: Awaited<ReturnType<typeof startLanguageServer>> | null = null
    let devProcess: Awaited<ReturnType<typeof startPreviewDevServer>> | null = null
    let previewUrl: string

    const startServers = async () => {
      lspProcess = await startLanguageServer(runtimeInstance, runtimeToken)
      throwIfRuntimeSessionStale(runtimeToken)
      devProcess = await startPreviewDevServer(runtimeInstance, runtimeToken)
      throwIfRuntimeSessionStale(runtimeToken)
      return waitForServerPort(
        serverTracker.waitFor(runtimeProfile.port),
        devProcess,
        runtimeProfile.devCommand,
      )
    }

    try {
      await waitForLanguageServerDependencies(runtimeInstance, 10000, runtimeToken)
      previewUrl = await startServers()
      throwIfRuntimeSessionStale(runtimeToken)
    }
    catch (error) {
      if (isTutorialRuntimeCancellationError(error))
        throw error

      if (!restoredDependenciesFromCache) {
        throw error
      }

      appendLogForRuntime('$ cached dependencies failed to boot; reinstalling packages', runtimeToken)
      await clearTutorialDependencyCache(dependencySignature ?? undefined).catch(() => null)
      throwIfRuntimeSessionStale(runtimeToken)

      languageServerTransport.value = null
      await stopProcess(lspProcess)
      await stopProcess(devProcess)
      throwIfRuntimeSessionStale(runtimeToken)

      await removeContainerDependencies(runtimeInstance)
      throwIfRuntimeSessionStale(runtimeToken)
      await installContainerDependencies(runtimeInstance, baseSnapshot, runtimeToken)
      throwIfRuntimeSessionStale(runtimeToken)
      shouldPersistDependencies = Boolean(dependencySignature)

      serverTracker = createTutorialServerTracker()
      await waitForLanguageServerDependencies(runtimeInstance, 10000, runtimeToken)
      previewUrl = await startServers()
      throwIfRuntimeSessionStale(runtimeToken)
    }

    previewBaseUrl.value = previewUrl

    if (lspProcess) {
      languageServerTransport.value = createTutorialLspProcessTransport(lspProcess)
    }

    if (shouldPersistDependencies && dependencySignature) {
      window.setTimeout(() => {
        void persistDependencyCache(runtimeInstance, dependencySignature, runtimeToken)
      }, 0)
    }

    if (pendingChapterSyncRequest && isCurrentChapterTask(pendingChapterSyncRequest.token)) {
      pendingChapterSyncRequest = null
    }

    const chapterToSync = currentChapter.value
    await syncChapterToContainer(chapterToSync, {
      reload: true,
      token: latestSelectedChapterToken.value,
    })
    throwIfRuntimeSessionStale(runtimeToken)

    if (currentChapter.value.id === chapterToSync.id) {
      await checkChapter({
        reload: false,
        chapter: chapterToSync,
        token: latestSelectedChapterToken.value,
      })
    }
    else {
      syncedChapterId.value = null
      setStatusForRuntime('ready', `The tutorial is ready. Loading “${currentChapter.value.title}”…`, runtimeToken)
      queueCurrentChapterSync(latestSelectedChapterToken.value)
    }
  }
  catch (error) {
    if (isTutorialRuntimeCancellationError(error)) {
      if (instance && webContainer.value === instance) {
        await stopTutorialRuntime()
      }
      else if (instance) {
        try {
          instance.teardown()
        }
        catch {
        }
      }
      return
    }

    if (instance && !isCurrentRuntimeSession(runtimeToken)) {
      try {
        instance.teardown()
      }
      catch {
      }
      return
    }

    setStatusForRuntime('error', error instanceof Error ? error.message : String(error), runtimeToken)
    appendLogForRuntime(String(error), runtimeToken)
  }
}

async function syncChapterToContainer(
  chapter = currentChapter.value,
  options: { reload?: boolean, token?: number } = {},
) {
  if (!webContainer.value)
    return

  const chapterTaskToken = options.token ?? latestSelectedChapterToken.value
  startChapterTask()

  try {
    throwIfChapterTaskStale(chapterTaskToken)
    const targetProjectSnapshot = getChapterSnapshot(chapter, getFrameworkChapterDrafts(chapter.framework)[chapter.id] ?? {})
    console.log('[tutorial] sync current chapter start', {
      chapterId: chapter.id,
      reload: Boolean(options.reload),
      targetFileCount: Object.keys(targetProjectSnapshot).length,
    })
    setStatusForChapter(chapter, 'syncing', `Syncing files for “${chapter.title}”…`, chapterTaskToken)
    await flushPendingWrites(chapterTaskToken)
    await applyProjectSnapshotToContainer(targetProjectSnapshot, chapterTaskToken)

    if (options.reload) {
      throwIfChapterTaskStale(chapterTaskToken)
      console.log('[tutorial] reloading preview after chapter sync', {
        chapterId: chapter.id,
      })
      setStatusForChapter(chapter, 'syncing', `Reloading “${chapter.title}”…`, chapterTaskToken)
      reloadPreview()
      const currentPreviewSessionId = previewSessionId.value
      await waitForPreviewState({
        predicate: isPreviewBooted,
        previewSessionId: currentPreviewSessionId ?? undefined,
        chapterTaskToken,
      })
    }

    throwIfChapterTaskStale(chapterTaskToken)

    if (isCurrentChapterTask(chapterTaskToken) && currentChapter.value.id === chapter.id) {
      syncedChapterId.value = chapter.id
    }

    console.log('[tutorial] sync current chapter done', {
      chapterId: chapter.id,
    })
    setStatusForChapter(chapter, 'ready', 'The preview is ready. Edit the files, run the preview, and check your work.', chapterTaskToken)
  }
  catch (error) {
    if (isTutorialChapterTaskCancellationError(error)) {
      return
    }

    setStatusForChapter(chapter, 'error', error instanceof Error ? error.message : String(error), chapterTaskToken)
  }
  finally {
    finishChapterTask()
  }
}

async function checkChapter(options: { reload?: boolean, chapter?: TutorialChapter, token?: number } = {}) {
  const { reload = true } = options
  const chapter = options.chapter ?? currentChapter.value
  const chapterTaskToken = options.token ?? latestSelectedChapterToken.value
  ensureCurrentChapterState(chapter)

  if (!webContainer.value) {
    await startTutorial()
  }

  if (!webContainer.value) {
    return
  }

  startChapterTask()

  try {
    throwIfChapterTaskStale(chapterTaskToken)
    setStatusForChapter(chapter, 'checking', `Checking “${chapter.title}”…`, chapterTaskToken)
    await flushPendingWrites(chapterTaskToken)

    if (reload) {
      await syncChapterToContainer(chapter, {
        reload: true,
        token: chapterTaskToken,
      })
      throwIfChapterTaskStale(chapterTaskToken)
    }

    let state: TutorialPreviewState

    if (!reload && !chapter.validationAction && chapter.editableFiles.length === 0 && isPreviewBooted(previewState.value)) {
      state = previewState.value
    }
    else {
      await waitForPreviewState({
        predicate: isPreviewBooted,
        previewSessionId: previewSessionId.value ?? undefined,
        chapterTaskToken,
      })

      state = await requestPreviewState(previewSessionId.value ?? undefined, chapterTaskToken)
    }

    if (chapter.validationAction) {
      state = await runPreviewAction(chapter.validationAction, chapterTaskToken)
    }

    let result = validateStep(chapter, state)

    if (!result.ok && !chapter.validationAction && !state.lastError) {
      const retryDeadline = Date.now() + 2500

      while (Date.now() < retryDeadline && !result.ok) {
        throwIfChapterTaskStale(chapterTaskToken)
        await new Promise(resolve => window.setTimeout(resolve, 200))
        state = await requestPreviewState(previewSessionId.value ?? undefined, chapterTaskToken)
        result = validateStep(chapter, state)
      }
    }

    throwIfChapterTaskStale(chapterTaskToken)
    setFrameworkValidation(chapter.framework, chapter.id, result)

    console.log('Validation result:', result)

    if (result.ok) {
      setFrameworkCompletedChapterIds(
        chapter.framework,
        [...new Set([...getFrameworkCompletedChapterIds(chapter.framework), chapter.id])],
      )
      setStatusForChapter(chapter, 'ready', `“${chapter.title}” passed.`, chapterTaskToken)
    }
    else {
      setFrameworkCompletedChapterIds(
        chapter.framework,
        getFrameworkCompletedChapterIds(chapter.framework).filter(id => id !== chapter.id),
      )
      setStatusForChapter(chapter, 'ready', `Chapter “${chapter.title}” still needs work.`, chapterTaskToken)
    }
  }
  catch (error) {
    if (isTutorialChapterTaskCancellationError(error)) {
      return
    }

    const result: TutorialValidationResult = {
      ok: false,
      summary: 'The preview could not be validated.',
      details: [error instanceof Error ? error.message : String(error)],
      failingFiles: chapter.editableFiles,
    }

    setFrameworkValidation(chapter.framework, chapter.id, result)

    setStatusForChapter(chapter, 'error', result.details[0]!, chapterTaskToken)
  }
  finally {
    finishChapterTask()
  }
}

function queueCurrentChapterSync(token: number) {
  if (!webContainer.value || !isCurrentChapterTask(token))
    return

  pendingChapterSyncRequest = { token }

  if (['booting', 'installing', 'starting'].includes(status.value)) {
    return
  }

  if (!chapterSyncPromise) {
    chapterSyncPromise = processQueuedChapterSyncs()
  }
}

async function processQueuedChapterSyncs() {
  while (pendingChapterSyncRequest) {
    const request = pendingChapterSyncRequest
    pendingChapterSyncRequest = null

    if (!request || !isCurrentChapterTask(request.token)) {
      continue
    }

    while (true) {
      const waitingForRuntime = ['booting', 'installing', 'starting'].includes(status.value)
      const waitingForChapterTask = activeChapterTaskCount > 0

      if (!waitingForRuntime && !waitingForChapterTask) {
        break
      }

      if (!isCurrentChapterTask(request.token)) {
        break
      }

      await new Promise(resolve => window.setTimeout(resolve, 100))
    }

    if (!isCurrentChapterTask(request.token)) {
      continue
    }

    const chapter = currentChapter.value

    await syncChapterToContainer(chapter, {
      reload: false,
      token: request.token,
    })

    if (!isCurrentChapterTask(request.token) || currentChapter.value.id !== chapter.id) {
      continue
    }

    await checkChapter({
      reload: false,
      chapter,
      token: request.token,
    }).catch(() => null)
  }

  chapterSyncPromise = null

  if (pendingChapterSyncRequest) {
    chapterSyncPromise = processQueuedChapterSyncs()
  }
}

async function openCorrection() {
  ensureCurrentChapterState()
  correctionOpen.value = true
  correctionFile.value = getPrimaryCorrectionFile(currentChapter.value, currentDraft.value) ?? currentChapter.value.editableFiles[0] ?? null
}

async function applyCorrections() {
  const chapter = currentChapter.value
  const nextDraft = applyStepCorrections(chapter, currentDraft.value)

  setFrameworkDraft(chapter.framework, chapter.id, nextDraft)
  markChapterDirty(chapter.id)

  if (webContainer.value) {
    await syncChapterToContainer(chapter, {
      reload: false,
    })
    await checkChapter({
      reload: false,
      chapter,
    })
  }
}

function closeCorrection() {
  correctionOpen.value = false
}

function openTrackPicker() {
  showTrackPicker.value = true
}

function closeTrackPicker() {
  if (!hasSelectedTrack.value) {
    return
  }

  showTrackPicker.value = false
}

function selectChapter(index: number) {
  if (index < 0 || index >= tutorialChapters.value.length || index === activeChapterIndex.value)
    return

  latestSelectedChapterToken.value = latestChapterTask.issue()
  cancelChapterTaskRequests()
  syncedChapterId.value = null
  activeChapterIndex.value = index
  queueCurrentChapterSync(latestSelectedChapterToken.value)
}

async function selectFramework(framework: TutorialFramework) {
  if (framework === selectedFramework.value)
    return

  latestRuntimeSession.invalidate()
  selectedFramework.value = framework
  latestSelectedChapterToken.value = latestChapterTask.issue()
  cancelChapterTaskRequests()
  syncedChapterId.value = null
  correctionOpen.value = false
  correctionFile.value = null
  ensureCurrentChapterState()
  await stopTutorialRuntime()

  if (hasMounted.value && supportState.value?.supported) {
    await startTutorial()
  }
}

async function selectTrackFromPicker(framework: TutorialFramework) {
  hasSelectedTrack.value = true
  correctionOpen.value = false
  correctionFile.value = null

  if (framework === selectedFramework.value) {
    showTrackPicker.value = false

    if (hasMounted.value && supportState.value?.supported && !webContainer.value && !isBusy.value) {
      await startTutorial()
    }

    return
  }

  showTrackPicker.value = false
  await selectFramework(framework)
}

function goToNextChapter() {
  if (nextChapter.value) {
    selectChapter(nextChapter.value.index)
  }
}

function goToPreviousChapter() {
  if (previousChapter.value) {
    selectChapter(previousChapter.value.index)
  }
}

watch(currentChapter, (chapter) => {
  ensureCurrentChapterState(chapter)

  if (correctionOpen.value) {
    correctionFile.value = getPrimaryCorrectionFile(chapter, getFrameworkChapterDrafts(chapter.framework)[chapter.id] ?? {}) ?? chapter.editableFiles[0] ?? null
  }
}, { immediate: true })

watch(storedFramework, (framework) => {
  const resolvedFramework = resolveTutorialFramework(framework)

  if (framework !== resolvedFramework) {
    storedFramework.value = resolvedFramework
  }
}, { immediate: true })

onMounted(() => {
  hasMounted.value = true
  viewportQuery = window.matchMedia('(min-width: 1280px)')
  syncViewportLayout()
  viewportQuery.addEventListener('change', syncViewportLayout)
  supportState.value = detectTutorialSupport(window as Window & typeof globalThis)
  ensureCurrentChapterState()
  window.addEventListener('message', handlePreviewMessage)
})

onBeforeUnmount(async () => {
  hasMounted.value = false
  viewportQuery?.removeEventListener('change', syncViewportLayout)
  viewportQuery = null
  window.removeEventListener('message', handlePreviewMessage)
  latestRuntimeSession.invalidate()
  await stopTutorialRuntime()
  await disposeTutorialMonacoWorkspace()
})
</script>

<template>
  <section class="flex flex-col p-2 gap-2 text-zinc-900 dark:text-zinc-100 fixed inset-0 top-16 z-31 bg-(--vp-c-bg) border-t border-(--vp-c-divider)">
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
              :previous-chapter="previousChapter"
              :next-chapter="nextChapter"
              :chapter-index="activeChapterIndex + 1"
              :total-chapters="tutorialChapters.length"
              :grouped-chapters="groupedChapters"
              :active-chapter-id="currentChapter.id"
              :completed-chapter-ids="currentCompletedChapterIds"
              :is-busy="isBusy"
              @previous="goToPreviousChapter()"
              @next="goToNextChapter()"
              @select-chapter="selectChapter($event)"
              @open-track-picker="openTrackPicker()"
            />

            <TutorialStepGuide
              :chapter="currentChapter"
              :previous-chapter="previousChapter"
              :next-chapter="nextChapter"
              class="flex-1 min-h-0"
              @previous="goToPreviousChapter()"
              @next="goToNextChapter()"
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
                :step-id="currentChapter.id"
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
              :last-error="status === 'error' || previewState.lastError ? (previewState.lastError ?? logs.at(-1)?.text ?? 'The preview could not start.') : null"
              :logs="logs"
              :web-container="webContainer"
              :validation="currentValidation"
              :status-message="statusMessage"
              :status="status"
              :is-busy="isBusy"
              class="flex-1 min-h-0"
              @check="checkChapter()"
              @show-correction="openCorrection()"
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

      <TutorialTrackPicker
        :open="showTrackPicker"
        :tracks="trackOptions"
        :selected-framework="selectedFramework"
        :is-busy="isBusy"
        @close="closeTrackPicker()"
        @select-framework="selectTrackFromPicker($event)"
      />
    </template>

    <TutorialCorrectionDialog
      :open="correctionOpen"
      :chapter-title="currentChapter.title"
      :correction-files="correctionFiles"
      :selected-file="correctionFile"
      :is-busy="isBusy"
      @close="closeCorrection()"
      @apply="applyCorrections()"
      @select-file="correctionFile = $event"
    >
      <MonacoEditor
        variant="diff"
        :step-id="currentChapter.id"
        :file-path="correctionFile"
        :project-files="currentCorrectionSnapshot"
        :solution-files="currentChapter.solutionFiles"
        class="min-h-[34rem] flex-1 overflow-hidden"
      />
    </TutorialCorrectionDialog>
  </section>
</template>
