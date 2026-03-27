import type { TutorialChapter, TutorialFramework } from './utils/types'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getTutorialChapterDefinitions,
  tutorialChapterDefinitions,
  tutorialChapterDefinitionsByFramework,
  tutorialChapterFolders,
  tutorialChapterFoldersByFramework,
  tutorialTracks,
} from './steps/registry'
import * as shared from './steps/shared'
import {
  applyStepCorrections,
  buildTutorialFileTree,
  composeStepOverlaySnapshot,
  composeStepSnapshot,
  composeVisibleStepSnapshot,
  createLatestRequestController,
  createTutorialSearchSegments,
  createTutorialSearchSnippet,
  detectTutorialSupport,
  diffLayeredSnapshots,
  diffSnapshots,
  getAdjacentTutorialChapters,
  getDifferingEditableFiles,
  getPrimaryCorrectionFile,
  getTutorialChapterEditorFiles,
  groupTutorialChapters,
  isTutorialPreviewSessionCurrent,
  mergeTutorialOpenFiles,
  normalizeTutorialGuideSearchText,
  planTutorialExactSync,
  prioritizeTutorialOpenFiles,
  resetStepFiles,
  resolveTutorialChapterSelectedFile,
  resolveTutorialSelectedFile,
} from './utils'
import {
  getFrameworkBaseFiles,
  getStepRuntimeAssets,
  getStepSolutionFiles,
  getStepSolutionOverlayFiles,
  getStepStarterFiles,
  getStepStarterOverlayFiles,
} from './utils/tutorialAssets'
import { createTutorialDependencyInstallPlan } from './utils/tutorialDependencyInstall'
import {
  createTutorialFrameworkRecord,
  defaultTutorialFramework,
  resolveTutorialFramework,
  tutorialFrameworks,
} from './utils/tutorialFrameworkState'
import { createVendoredRstorePackageFiles } from './utils/tutorialLocalPackages'
import { appendTutorialLogMessage, appendTutorialRuntimeOutputChunk } from './utils/tutorialRuntimeLogs'
import {
  createTutorialChapterTaskSessionController,
  createTutorialRuntimeSessionController,
  isTutorialChapterTaskCancellationError,
  isTutorialRuntimeCancellationError,
} from './utils/tutorialRuntimeSession'
import { createTutorialServerTracker, getTutorialRuntimeProfile } from './utils/tutorialServerUrls'
import {
  clearTutorialDependencyCache,
  getTutorialDependencyCacheRecordKey,
  getTutorialDependencyCacheSignature,
  restoreTutorialDependencyCache,
  saveTutorialDependencyCache,
} from './utils/webContainerCache'

function routeToDocFile(route: string): string {
  return resolve(process.cwd(), 'docs', `${route.replace(/^\//, '')}.md`)
}

function routeToTutorialGuide(folder: string): string {
  return resolve(process.cwd(), 'docs', '.vitepress', 'tutorial', folder, 'index.md')
}

function resolveChapter(chapterId: string): TutorialChapter {
  const definition = tutorialChapterDefinitions.find(chapter => chapter.id === chapterId)

  if (!definition)
    throw new Error(`Unknown tutorial chapter: ${chapterId}`)

  const sourceChapterId = definition.playgroundSourceChapterId
  const sourceRuntimeAssets = getStepRuntimeAssets(sourceChapterId ?? chapterId)
  const sourceStarterFiles = getStepStarterFiles(sourceChapterId ?? chapterId)
  const sourceSolutionFiles = getStepSolutionFiles(sourceChapterId ?? chapterId)
  const editableFiles = sourceChapterId
    ? getTutorialPlaygroundEditableFiles(sourceSolutionFiles, definition.framework)
    : definition.editableFiles
  const runtimeAssets = sourceChapterId
    ? {
        frameworkBaseFiles: sourceRuntimeAssets.frameworkBaseFiles,
        starterOverlayFiles: { ...sourceRuntimeAssets.solutionOverlayFiles },
        solutionOverlayFiles: { ...sourceRuntimeAssets.solutionOverlayFiles },
      }
    : sourceRuntimeAssets

  return {
    ...definition,
    editableFiles,
    folder: tutorialChapterFolders[chapterId],
    runtimeAssets,
    starterFiles: sourceChapterId ? { ...sourceSolutionFiles } : sourceStarterFiles,
    solutionFiles: { ...sourceSolutionFiles },
    guideComponent: {} as TutorialChapter['guideComponent'],
    guideSearchText: normalizeTutorialGuideSearchText(readFileSync(routeToTutorialGuide(tutorialChapterFolders[chapterId]), 'utf8')),
  }
}

function getTutorialPlaygroundEditableFiles(files: Record<string, string>, framework: TutorialFramework) {
  return Object.keys(files)
    .filter(filePath => isTutorialPlaygroundFile(filePath, framework))
    .sort((a, b) => {
      const rankDiff = getTutorialPlaygroundFileRank(a, framework) - getTutorialPlaygroundFileRank(b, framework)
      return rankDiff || a.localeCompare(b)
    })
}

function isTutorialPlaygroundFile(filePath: string, framework: TutorialFramework) {
  if (
    filePath === 'index.html'
    || filePath === 'package.json'
    || filePath === 'package-lock.json'
    || filePath === 'tsconfig.json'
    || filePath === 'vite.config.ts'
    || filePath === 'src/env.d.ts'
    || filePath === 'src/runtimeBanner.ts'
    || filePath.startsWith('scripts/')
    || filePath.startsWith('src/tutorial/')
    || filePath.startsWith('vendor/')
  ) {
    return false
  }

  if (framework === 'vue') {
    return filePath.startsWith('src/')
  }

  return (
    filePath === 'nuxt.config.ts'
    || filePath === 'src/style.css'
    || filePath.startsWith('app/')
    || filePath.startsWith('server/')
  )
}

function getTutorialPlaygroundFileRank(filePath: string, framework: TutorialFramework) {
  if (framework === 'vue') {
    if (filePath === 'src/components/TutorialContent.vue')
      return 0
    if (filePath === 'src/App.vue')
      return 1
    if (filePath.startsWith('src/components/'))
      return 2
    if (filePath.startsWith('src/rstore/'))
      return 3
    if (filePath === 'src/main.ts')
      return 4
    if (filePath === 'src/style.css')
      return 5
    return 6
  }

  if (filePath.startsWith('app/pages/'))
    return 0
  if (filePath.startsWith('app/components/'))
    return 1
  if (filePath.startsWith('app/rstore/'))
    return 2
  if (filePath === 'app/app.vue')
    return 3
  if (filePath.startsWith('server/'))
    return 4
  if (filePath === 'nuxt.config.ts')
    return 5
  if (filePath.startsWith('app/plugins/'))
    return 6
  if (filePath === 'src/style.css')
    return 7
  return 8
}

function resolveTrackChapters(framework: TutorialFramework) {
  return getTutorialChapterDefinitions(framework).map(definition => resolveChapter(definition.id))
}

const resolvedVueChapters = resolveTrackChapters('vue')
const resolvedNuxtChapters = resolveTrackChapters('nuxt')
const originalIndexedDb = globalThis.indexedDB

afterEach(() => {
  if (originalIndexedDb) {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: originalIndexedDb,
      writable: true,
    })
  }
  else {
    Reflect.deleteProperty(globalThis, 'indexedDB')
  }
})

function installFakeIndexedDb() {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: new IDBFactory(),
    writable: true,
  })
}

function createMockCacheWebContainer(options: {
  nodeModulesSnapshot?: Uint8Array
  packageLock?: string | null
} = {}) {
  const state = {
    fsFiles: new Map<string, string>(),
    mountedSnapshots: [] as Array<{ mountPoint?: string, snapshot: Uint8Array }>,
    removedPaths: [] as string[],
  }
  const exportedSnapshot = options.nodeModulesSnapshot ?? new Uint8Array()

  if (options.packageLock != null) {
    state.fsFiles.set('package-lock.json', options.packageLock)
  }

  return {
    state,
    webContainer: {
      export: async () => exportedSnapshot,
      mount: async (snapshot: Uint8Array, mountOptions?: { mountPoint?: string }) => {
        state.mountedSnapshots.push({
          mountPoint: mountOptions?.mountPoint,
          snapshot,
        })
      },
      fs: {
        readFile: async (filePath: string) => {
          if (!state.fsFiles.has(filePath)) {
            throw new Error(`Missing file: ${filePath}`)
          }

          return state.fsFiles.get(filePath)!
        },
        rm: async (filePath: string) => {
          state.removedPaths.push(filePath)
        },
        writeFile: async (filePath: string, content: string) => {
          state.fsFiles.set(filePath, content)
        },
      },
    },
  }
}

async function writeTutorialDependencyCacheRecord(recordKey: string, record: Record<string, unknown>) {
  const request = indexedDB.open('rstore-docs-tutorial', 3)
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onupgradeneeded = () => {
      const db = request.result

      if (db.objectStoreNames.contains('webcontainer-cache')) {
        db.deleteObjectStore('webcontainer-cache')
      }

      db.createObjectStore('webcontainer-cache')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  try {
    const transaction = database.transaction('webcontainer-cache', 'readwrite')
    const store = transaction.objectStore('webcontainer-cache')
    await new Promise<void>((resolve, reject) => {
      const putRequest = store.put(record, recordKey)
      putRequest.onsuccess = () => resolve()
      putRequest.onerror = () => reject(putRequest.error)
    })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
      transaction.onerror = () => reject(transaction.error)
    })
  }
  finally {
    database.close()
  }
}

describe('interactive tutorial chapters', () => {
  it('validates seeded todo chapters from rendered seeded texts instead of exact counts', () => {
    const chapter = resolveChapter('vue-define-collections')

    const result = chapter.validator({
      storeReady: true,
      listCount: 1,
      todoTexts: [...shared.seededTodoTexts],
    })

    expect(result).toEqual({
      ok: true,
      summary: 'The schema now exposes the collections the app needs.',
      details: [
        'The Vue app can resolve seeded todos through the typed collection definitions.',
      ],
    })
  })

  it('fails seeded todo chapters when one or more seeded titles are missing', () => {
    const chapter = resolveChapter('vue-define-collections')

    const result = chapter.validator({
      storeReady: true,
      listCount: 3,
      todoTexts: shared.seededTodoTexts.slice(0, 2),
    })

    expect(result.ok).toBe(false)
    expect(result.summary).toBe('The preview is not showing the seeded todo list yet.')
    expect(result.details).toContain('The current chapter should render the seeded tutorial todos instead of placeholder content.')
    expect(result.details).toContain(`Missing seeded todos: ${shared.seededTodoTexts[2]}.`)
    expect(result.failingFiles).toEqual(['src/rstore/schema.ts'])
  })

  it('fails seeded todo chapters when the store never becomes ready', () => {
    const chapter = resolveChapter('vue-define-collections')

    const result = chapter.validator({
      storeReady: false,
      listCount: 3,
      todoTexts: [...shared.seededTodoTexts],
    })

    expect(result.ok).toBe(false)
    expect(result.summary).toBe('The preview never finished installing rstore in the app.')
    expect(result.failingFiles).toEqual(['src/rstore/schema.ts'])
  })

  it('assigns explicit smoke actions to active chapters that depend on seeded list validation', () => {
    const expectedValidationActions = {
      'vue-define-collections': 'query-smoke',
      'vue-create-install-store': 'query-smoke',
      'vue-query-list': 'query-refresh-smoke',
      'vue-extract-plugin': 'query-smoke',
      'nuxt-module-setup': 'query-smoke',
      'nuxt-query-page': 'query-smoke',
      'nuxt-move-transport-plugin': 'query-smoke',
    }

    for (const [chapterId, validationAction] of Object.entries(expectedValidationActions)) {
      expect(resolveChapter(chapterId).validationAction).toBe(validationAction)
    }
  })

  it('vendors local rstore package builds into framework-specific tutorial snapshots', () => {
    const allFiles = createVendoredRstorePackageFiles()
    const vueFiles = createVendoredRstorePackageFiles('vue')
    const nuxtFiles = createVendoredRstorePackageFiles('nuxt')
    const vueManifest = JSON.parse(vueFiles['vendor/@rstore/vue/package.json']!)
    const nuxtManifest = JSON.parse(nuxtFiles['vendor/@rstore/nuxt/package.json']!)

    expect(allFiles['vendor/@rstore/devtools/dist/index.mjs']).toBeTypeOf('string')
    expect(vueFiles['vendor/@rstore/shared/dist/index.d.ts']).toBeTypeOf('string')
    expect(vueFiles['vendor/@rstore/shared/src/index.ts']).toBeTypeOf('string')
    expect(vueFiles['vendor/@rstore/core/dist/index.mjs']).toBeTypeOf('string')
    expect(vueFiles['vendor/@rstore/core/src/index.ts']).toBeTypeOf('string')
    expect(vueFiles['vendor/@rstore/vue/dist/index.cjs']).toBeTypeOf('string')
    expect(vueFiles['vendor/@rstore/vue/src/index.ts']).toBeTypeOf('string')
    expect(vueFiles['vendor/@rstore/devtools/dist/index.mjs']).toBeUndefined()
    expect(vueFiles['vendor/@rstore/nuxt/dist/module.mjs']).toBeUndefined()
    expect(nuxtFiles['vendor/@rstore/nuxt/dist/module.mjs']).toBeTypeOf('string')
    expect(nuxtFiles['vendor/@rstore/devtools/dist/index.mjs']).toBeUndefined()
    expect(vueManifest.dependencies).toMatchObject({
      '@rstore/core': 'file:../core',
      '@rstore/shared': 'file:../shared',
    })
    expect(nuxtManifest.dependencies).toMatchObject({
      '@rstore/shared': 'file:../shared',
      '@rstore/vue': 'file:../vue',
    })
    expect(nuxtManifest.dependencies).not.toHaveProperty('@rstore/devtools')
    expect(Object.keys(allFiles).some(filePath => filePath.endsWith('.map'))).toBe(false)
  })

  it('keeps chapter metadata complete and resolves assets from both framework content roots', () => {
    const ids = new Set<string>()

    for (const definition of tutorialChapterDefinitions) {
      const chapter = resolveChapter(definition.id)
      expect(ids.has(chapter.id)).toBe(false)
      ids.add(chapter.id)

      expect(chapter.id.startsWith(`${chapter.framework}-`)).toBe(true)
      expect(chapter.referenceLinks.length).toBeGreaterThan(0)
      for (const link of chapter.referenceLinks) {
        expect(link.label.length).toBeGreaterThan(0)
        expect(existsSync(routeToDocFile(link.href))).toBe(true)
      }
      expect(existsSync(routeToTutorialGuide(chapter.folder))).toBe(true)
      expect(chapter.guideSearchText.length).toBeGreaterThan(40)
      expect(chapter.guideSearchText).not.toMatch(/^---/)
      expect(chapter.guideSearchText).not.toContain('```')

      for (const editableFile of chapter.editableFiles) {
        expect(chapter.starterFiles[editableFile]).toBeTypeOf('string')
        expect(chapter.solutionFiles[editableFile]).toBeTypeOf('string')
      }
    }

    expect(resolveChapter('vue-welcome').editableFiles).toEqual([])
    expect(resolveChapter('nuxt-welcome').editableFiles).toEqual([])
    expect(resolveChapter('nuxt-module-setup').editableFiles).toEqual([
      'nuxt.config.ts',
      'app/rstore/todos.ts',
      'app/rstore/users.ts',
    ])
    expect(resolveChapter('vue-advanced-workflows').title).toBe('Learn Next')
    expect(resolveChapter('nuxt-advanced-workflows').title).toBe('Learn Next')
    expect(tutorialChapterDefinitionsByFramework.vue).toHaveLength(14)
    expect(tutorialChapterDefinitionsByFramework.nuxt).toHaveLength(14)
    expect(tutorialChapterDefinitionsByFramework.vue.some(chapter => chapter.id === 'vue-project-tour')).toBe(false)
    expect(tutorialChapterDefinitionsByFramework.nuxt.some(chapter => chapter.id === 'nuxt-server-api-routes')).toBe(true)
    expect(tutorialChapterDefinitionsByFramework.vue.some(chapter => chapter.id === 'vue-add-collection-hooks')).toBe(false)
    expect(tutorialChapterDefinitionsByFramework.vue.some(chapter => chapter.id === 'vue-query-loading-refresh')).toBe(false)
    expect(tutorialChapterDefinitionsByFramework.vue.some(chapter => chapter.id === 'vue-update-delete-todos')).toBe(false)
    expect(tutorialChapterDefinitionsByFramework.nuxt.some(chapter => chapter.id === 'nuxt-define-collections')).toBe(false)
    expect(tutorialChapterDefinitionsByFramework.nuxt.some(chapter => chapter.id === 'nuxt-auto-store')).toBe(false)
    expect(tutorialChapterDefinitionsByFramework.nuxt.some(chapter => chapter.id === 'nuxt-update-delete-todos')).toBe(false)
  })

  it('normalizes raw guide markdown into readable search text', () => {
    expect(normalizeTutorialGuideSearchText(`
---
title: Search Demo
---

# Query Guide

1. Use \`query()\`.
- Open [Getting Started](/guide/getting-started).
> Keep the list reactive.
`)).toBe('Query Guide Use query(). Open Getting Started. Keep the list reactive.')
  })

  it('builds highlighted text segments from search ranges', () => {
    expect(createTutorialSearchSegments('Live Query tutorial', [
      [0, 3],
      [5, 9],
    ])).toEqual([
      { text: 'Live', highlighted: true },
      { text: ' ', highlighted: false },
      { text: 'Query', highlighted: true },
      { text: ' tutorial', highlighted: false },
    ])
  })

  it('builds stable guide snippets and merges overlapping match windows', () => {
    const snippet = createTutorialSearchSnippet(
      'Alpha beta gamma delta epsilon zeta',
      [
        [6, 9],
        [11, 15],
      ],
      {
        contextChars: 2,
        maxMatches: 2,
      },
    )

    expect(snippet).toEqual({
      leadingEllipsis: true,
      trailingEllipsis: true,
      segments: [
        { text: 'a ', highlighted: false },
        { text: 'beta', highlighted: true },
        { text: ' ', highlighted: false },
        { text: 'gamma', highlighted: true },
        { text: ' d', highlighted: false },
      ],
    })
  })

  it('includes framework-specific base assets and chapter overlays in resolved snapshots', () => {
    const vueCollectionsStarter = getStepStarterFiles('vue-define-collections')
    const vueCollectionsSolution = getStepSolutionFiles('vue-define-collections')
    const vueQueryStarter = getStepStarterFiles('vue-query-list')
    const vueQuerySolution = getStepSolutionFiles('vue-query-list')
    const nuxtModuleStarter = getStepStarterFiles('nuxt-module-setup')
    const nuxtModuleSolution = getStepSolutionFiles('nuxt-module-setup')
    const nuxtQueryStarter = getStepStarterFiles('nuxt-query-page')
    const nuxtQuerySolution = getStepSolutionFiles('nuxt-query-page')
    const nuxtCacheStarter = getStepStarterFiles('nuxt-cache-apis')
    const vueManifest = JSON.parse(vueQueryStarter['package.json']!)
    const nuxtManifest = JSON.parse(nuxtQueryStarter['package.json']!)
    const vuePackageLock = JSON.parse(vueQueryStarter['package-lock.json']!)
    const nuxtPackageLock = JSON.parse(nuxtQueryStarter['package-lock.json']!)
    const vueTsconfig = JSON.parse(vueQueryStarter['tsconfig.json']!)
    const nuxtTsconfig = JSON.parse(nuxtQueryStarter['tsconfig.json']!)

    expect(vueManifest.dependencies['@rstore/vue']).toBe('file:./vendor/@rstore/vue')
    expect(vuePackageLock.name).toBe('rstore-interactive-tutorial')
    expect(vueTsconfig.include).toContain('src/**/*.vue')
    expect(vueCollectionsStarter['src/rstore/schema.ts']).toContain(`import type { Todo, User } from './types'`)
    expect(vueCollectionsSolution['src/rstore/schema.ts']).toContain(`fetchMany: () => memoryBackend.list('todos')`)
    expect(vueQueryStarter['src/App.vue']).toContain('tutorialRuntimeBannerState')
    expect(vueQueryStarter['src/components/TutorialContent.vue']).toContain('No todos are showing yet.')
    expect(vueQuerySolution['src/components/TutorialContent.vue']).toContain('The list, loading badge, and refresh button now all come from one reactive query.')

    expect(nuxtManifest.dependencies['@rstore/nuxt']).toBe('file:./vendor/@rstore/nuxt')
    expect(nuxtManifest.dependencies.nuxt).toBe('4.4.2')
    expect(nuxtManifest.devDependencies.typescript).toBe('5.9.3')
    expect(nuxtPackageLock.name).toBe('rstore-interactive-tutorial')
    expect(nuxtTsconfig.include).toContain('app/**/*')
    expect(nuxtModuleStarter['nuxt.config.ts']).toContain(`modules: []`)
    expect(nuxtModuleSolution['nuxt.config.ts']).toContain(`modules: ['@rstore/nuxt']`)
    expect(nuxtModuleStarter['app/rstore/todos.ts']).toContain(`hooks: {}`)
    expect(nuxtModuleSolution['app/rstore/todos.ts']).toContain(`fetchMany: () => $fetch('/api/todos')`)
    expect(nuxtQueryStarter['nuxt.config.ts']).toContain(`modules: ['@rstore/nuxt']`)
    expect(nuxtQueryStarter['nuxt.config.ts']).toContain(`css: ['~~/src/style.css']`)
    expect(nuxtQueryStarter['app/plugins/tutorial.client.ts']).toContain(`from '#demo/runtime'`)
    expect(nuxtQueryStarter['app/pages/index.vue']).toContain('No todos are showing yet.')
    expect(nuxtCacheStarter['app/pages/index.vue']).not.toContain(`tutorial/bridge`)
    expect(nuxtQuerySolution['app/pages/index.vue']).toContain('The page now reads, refreshes, and reports loading from one store query.')
    expect(Object.keys(vueQueryStarter).some(filePath => filePath.startsWith('vendor/@rstore/nuxt/'))).toBe(false)
    expect(Object.keys(nuxtQueryStarter).some(filePath => filePath.startsWith('vendor/@rstore/devtools/'))).toBe(false)

    expect(Object.keys(vueQueryStarter).some(filePath => filePath.includes('+assets'))).toBe(false)
    expect(Object.keys(nuxtQueryStarter).some(filePath => filePath.includes('+assets'))).toBe(false)
  })

  it('separates framework base files from chapter overlay files while preserving merged snapshots', () => {
    const vueRuntimeAssets = getStepRuntimeAssets('vue-query-list')
    const nuxtRuntimeAssets = getStepRuntimeAssets('nuxt-query-page')

    expect(vueRuntimeAssets.frameworkBaseFiles).toEqual(getFrameworkBaseFiles('vue'))
    expect(vueRuntimeAssets.starterOverlayFiles).toEqual(getStepStarterOverlayFiles('vue-query-list'))
    expect(vueRuntimeAssets.solutionOverlayFiles).toEqual(getStepSolutionOverlayFiles('vue-query-list'))
    expect({
      ...vueRuntimeAssets.frameworkBaseFiles,
      ...vueRuntimeAssets.starterOverlayFiles,
    }).toEqual(getStepStarterFiles('vue-query-list'))
    expect({
      ...vueRuntimeAssets.frameworkBaseFiles,
      ...vueRuntimeAssets.solutionOverlayFiles,
    }).toEqual(getStepSolutionFiles('vue-query-list'))

    expect(nuxtRuntimeAssets.frameworkBaseFiles).toEqual(getFrameworkBaseFiles('nuxt'))
    expect(nuxtRuntimeAssets.starterOverlayFiles).toEqual(getStepStarterOverlayFiles('nuxt-query-page'))
    expect(nuxtRuntimeAssets.solutionOverlayFiles).toEqual(getStepSolutionOverlayFiles('nuxt-query-page'))
    expect({
      ...nuxtRuntimeAssets.frameworkBaseFiles,
      ...nuxtRuntimeAssets.starterOverlayFiles,
    }).toEqual(getStepStarterFiles('nuxt-query-page'))
    expect({
      ...nuxtRuntimeAssets.frameworkBaseFiles,
      ...nuxtRuntimeAssets.solutionOverlayFiles,
    }).toEqual(getStepSolutionFiles('nuxt-query-page'))
  })

  it('prefers npm ci for the Nuxt starter snapshot now that it ships a lockfile', () => {
    expect(createTutorialDependencyInstallPlan(getStepStarterFiles('nuxt-query-page'))).toEqual({
      primary: {
        args: ['ci', '--no-audit', '--prefer-offline'],
        label: 'npm ci --no-audit --prefer-offline',
      },
      fallback: {
        args: ['install', '--no-audit'],
        label: 'npm install --no-audit',
      },
    })
  })

  it('rewrites carriage-return npm spinner frames in place', () => {
    let logState = appendTutorialLogMessage([], '$ npm install --no-audit', 0)
    let streamState = {
      activeEntryId: null as number | null,
      currentLine: '',
    }

    let chunkState = appendTutorialRuntimeOutputChunk(logState.logs, {
      ...streamState,
      chunk: '|',
      label: 'npm',
      nextLogId: logState.nextLogId,
    })
    logState = {
      logs: chunkState.logs,
      nextLogId: chunkState.nextLogId,
    }
    streamState = {
      activeEntryId: chunkState.activeEntryId,
      currentLine: chunkState.currentLine,
    }

    chunkState = appendTutorialRuntimeOutputChunk(logState.logs, {
      ...streamState,
      chunk: '\r/',
      label: 'npm',
      nextLogId: logState.nextLogId,
    })
    logState = {
      logs: chunkState.logs,
      nextLogId: chunkState.nextLogId,
    }
    streamState = {
      activeEntryId: chunkState.activeEntryId,
      currentLine: chunkState.currentLine,
    }

    chunkState = appendTutorialRuntimeOutputChunk(logState.logs, {
      ...streamState,
      chunk: '\r-\r\\\r|\n',
      label: 'npm',
      nextLogId: logState.nextLogId,
    })
    logState = {
      logs: chunkState.logs,
      nextLogId: chunkState.nextLogId,
    }

    expect(logState.logs.map(log => log.text)).toEqual([
      '$ npm install --no-audit',
      '[npm] |',
    ])
  })

  it('re-appends runtime output when the previous active entry was trimmed away', () => {
    const initialLogs = Array.from({ length: 240 }, (_, index) => ({
      id: index + 1,
      text: `[seed] ${index}`,
    }))

    const nextChunk = appendTutorialRuntimeOutputChunk(initialLogs, {
      activeEntryId: 0,
      chunk: 'compiled',
      currentLine: '',
      label: 'dev',
      nextLogId: 241,
    })

    expect(nextChunk.logs).toHaveLength(240)
    expect(nextChunk.logs.at(-1)?.text).toBe('[dev] compiled')
  })

  it('keeps tutorial-only helpers out of editor-visible starter and solution files', () => {
    const forbiddenPatterns = [
      /from ['"][^'"]*tutorial\//,
      /\bregisterTutorialAction\b/,
      /\bsetTutorialState\b/,
    ]

    for (const definition of tutorialChapterDefinitions) {
      const chapter = resolveChapter(definition.id)

      for (const filePath of getTutorialChapterEditorFiles(chapter)) {
        const snapshots = [
          chapter.starterFiles[filePath] ?? '',
          chapter.solutionFiles[filePath] ?? '',
        ]

        for (const snapshot of snapshots) {
          for (const pattern of forbiddenPatterns) {
            expect(snapshot).not.toMatch(pattern)
          }
        }
      }
    }
  })

  it('keeps editable starter files free from answer-shaped tutorial hints', () => {
    const forbiddenPatterns = [
      /\/\/\s*fetchMany/,
      /Use createForm\(\) here/,
      /Use updateForm\(\) here/,
      /Try createForm\(\)/,
      /Replace the placeholder/,
      /placeholder state/,
      /Ship the /,
      /Your .* still/,
    ]

    for (const definition of tutorialChapterDefinitions) {
      const chapter = resolveChapter(definition.id)

      for (const editableFile of chapter.editableFiles) {
        const starter = chapter.starterFiles[editableFile] ?? ''

        for (const pattern of forbiddenPatterns) {
          expect(starter).not.toMatch(pattern)
        }
      }
    }
  })

  it('keeps tutorial guides focused on app-facing helper modules', () => {
    const liveGuide = readFileSync(resolve(process.cwd(), 'docs', '.vitepress', 'tutorial', 'nuxt', '12-live-query', 'index.md'), 'utf8')

    expect(liveGuide).not.toContain('tutorial/liveEvents')
    expect(liveGuide).toContain('Import `subscribeToRemoteTodos` from `../live`')
  })

  it('disables Monaco built-in TypeScript IDE providers so the sandbox LSP is the only source', () => {
    const loadMonacoSource = readFileSync(
      resolve(process.cwd(), 'docs/components/tutorial/utils/loadMonaco.ts'),
      'utf8',
    )

    expect(loadMonacoSource).toContain('defaults.setModeConfiguration(sandboxOnlyModeConfiguration)')
    expect(loadMonacoSource).toContain('completionItems: false')
    expect(loadMonacoSource).toContain('hovers: false')
    expect(loadMonacoSource).toContain('diagnostics: false')
    expect(loadMonacoSource).not.toContain('defaults.setExtraLibs(')
  })

  it('keeps chapter-local shared files in both starter and solution snapshots', () => {
    const pluginStarter = getStepStarterFiles('vue-extract-plugin')
    const pluginSolution = getStepSolutionFiles('vue-extract-plugin')

    expect(pluginStarter['src/rstore/schema.ts']).toBe(pluginSolution['src/rstore/schema.ts'])
    expect(pluginStarter['src/rstore/index.ts']).toBe(pluginSolution['src/rstore/index.ts'])
    expect(pluginStarter['src/rstore/memoryPlugin.ts']).not.toBe(pluginSolution['src/rstore/memoryPlugin.ts'])
  })

  it('uses the last hands-on solution as the unlocked learn-next playground', () => {
    const vuePlayground = resolveChapter('vue-advanced-workflows')
    const vueSource = resolveChapter('vue-cache-apis')
    const nuxtPlayground = resolveChapter('nuxt-advanced-workflows')
    const nuxtSource = resolveChapter('nuxt-cache-apis')

    expect(vuePlayground.starterFiles['src/components/CachePanel.vue']).toBe(vueSource.solutionFiles['src/components/CachePanel.vue'])
    expect(vuePlayground.solutionFiles['src/components/CachePanel.vue']).toBe(vueSource.solutionFiles['src/components/CachePanel.vue'])
    expect(vuePlayground.editableFiles).toEqual([
      'src/components/TutorialContent.vue',
      'src/App.vue',
      'src/components/CachePanel.vue',
      'src/components/TodoForm.vue',
      'src/rstore/backend.ts',
      'src/rstore/index.ts',
      'src/rstore/live.ts',
      'src/rstore/memoryPlugin.ts',
      'src/rstore/relations.ts',
      'src/rstore/schema.ts',
      'src/rstore/types.ts',
      'src/main.ts',
      'src/style.css',
    ])

    expect(nuxtPlayground.starterFiles['app/components/CachePanel.vue']).toBe(nuxtSource.solutionFiles['app/components/CachePanel.vue'])
    expect(nuxtPlayground.solutionFiles['app/components/CachePanel.vue']).toBe(nuxtSource.solutionFiles['app/components/CachePanel.vue'])
    expect(nuxtPlayground.editableFiles).toEqual([
      'app/pages/index.vue',
      'app/components/CachePanel.vue',
      'app/rstore/live.ts',
      'app/rstore/todos.ts',
      'app/rstore/types.ts',
      'app/rstore/users.ts',
      'app/app.vue',
      'server/api/todos/[id].delete.ts',
      'server/api/todos/[id].get.ts',
      'server/api/todos/[id].patch.ts',
      'server/api/todos/index.get.ts',
      'server/api/todos/index.post.ts',
      'server/api/users/[id].get.ts',
      'server/api/users/index.get.ts',
      'server/utils/tutorial-data.ts',
      'nuxt.config.ts',
      'app/plugins/tutorial.client.ts',
      'src/style.css',
    ])
  })

  it('maps every framework chapter id to a stable tutorial folder', () => {
    expect(tutorialTracks.vue.runtimePort).toBe(4173)
    expect(tutorialTracks.nuxt.runtimePort).toBe(3000)
    expect(tutorialChapterFolders['vue-welcome']).toBe('vue/01-welcome')
    expect(tutorialChapterFolders['vue-define-collections']).toBe('vue/02-define-collections')
    expect(tutorialChapterFolders['vue-local-first-mental-model']).toBe('vue/03-local-first-mental-model')
    expect(tutorialChapterFolders['vue-cache-apis']).toBe('vue/13-cache-apis')
    expect(tutorialChapterFolders['vue-advanced-workflows']).toBe('vue/14-advanced-workflows')
    expect(tutorialChapterFolders['nuxt-welcome']).toBe('nuxt/01-welcome')
    expect(tutorialChapterFolders['nuxt-server-api-routes']).toBe('nuxt/03-server-api-routes')
    expect(tutorialChapterFolders['nuxt-cache-apis']).toBe('nuxt/13-cache-apis')
    expect(tutorialChapterFolders['nuxt-advanced-workflows']).toBe('nuxt/14-advanced-workflows')
    expect(Object.keys(tutorialChapterFoldersByFramework.vue)).toHaveLength(14)
    expect(Object.keys(tutorialChapterFoldersByFramework.nuxt)).toHaveLength(14)
    expect(tutorialChapterFoldersByFramework.nuxt['nuxt-server-api-routes']).toBe('nuxt/03-server-api-routes')
  })

  it('keeps track metadata complete enough for the fullscreen picker', () => {
    expect(tutorialTracks.vue.imageSrc).toBe('/vue.svg')
    expect(tutorialTracks.nuxt.imageSrc).toBe('/nuxt.svg')

    for (const track of Object.values(tutorialTracks)) {
      expect(track.label.length).toBeGreaterThan(0)
      expect(track.description.length).toBeGreaterThan(0)
      expect(track.imageSrc.length).toBeGreaterThan(0)
      expect(tutorialChapterDefinitionsByFramework[track.framework].length).toBeGreaterThan(0)
    }
  })

  it('builds framework records from the registry and resolves invalid persisted frameworks', () => {
    const record = createTutorialFrameworkRecord(framework => framework)

    expect(Object.keys(record)).toEqual(tutorialFrameworks)
    expect(record.vue).toBe('vue')
    expect(record.nuxt).toBe('nuxt')
    expect(resolveTutorialFramework('nuxt')).toBe('nuxt')
    expect(resolveTutorialFramework('unknown-framework')).toBe(defaultTutorialFramework)
    expect(resolveTutorialFramework(null)).toBe(defaultTutorialFramework)
  })

  it('resets a chapter back to its editable starter files only', () => {
    const chapter = resolveChapter('vue-create-todos')
    const resetFiles = resetStepFiles(chapter)

    expect(Object.keys(resetFiles)).toEqual(chapter.editableFiles)
    expect(resetFiles['src/components/TutorialContent.vue']).toBe(chapter.starterFiles['src/components/TutorialContent.vue'])
  })

  it('builds a full snapshot by overlaying the current editable files', () => {
    const chapter = resolveChapter('vue-query-list')
    const currentFiles = {
      'src/components/TutorialContent.vue': 'changed app content',
    }

    const snapshot = composeStepSnapshot(chapter, currentFiles)

    expect(snapshot['src/components/TutorialContent.vue']).toBe('changed app content')
    expect(snapshot['src/main.ts']).toBe(chapter.starterFiles['src/main.ts'])
  })

  it('builds a chapter overlay snapshot without reintroducing framework base files', () => {
    const chapter = resolveChapter('nuxt-module-setup')
    const snapshot = composeStepOverlaySnapshot(chapter, {
      ...resetStepFiles(chapter),
      'nuxt.config.ts': 'changed nuxt config',
    })

    expect(snapshot['nuxt.config.ts']).toBe('changed nuxt config')
    expect(snapshot['app/rstore/todos.ts']).toBe(chapter.runtimeAssets.starterOverlayFiles['app/rstore/todos.ts'])
    expect(snapshot['package.json']).toBeUndefined()
  })

  it('builds a narrowed snapshot for the currently visible files', () => {
    const chapter = resolveChapter('vue-query-list')
    const snapshot = composeVisibleStepSnapshot(chapter, {
      'src/components/TutorialContent.vue': 'changed app content',
    }, [
      'src/components/TutorialContent.vue',
      'src/main.ts',
      'src/missing.ts',
    ])

    expect(snapshot).toEqual({
      'src/components/TutorialContent.vue': 'changed app content',
      'src/main.ts': chapter.starterFiles['src/main.ts'],
    })
  })

  it('finds only changed and removed files between snapshots', () => {
    expect(diffSnapshots({
      'src/App.vue': 'before',
      'src/old.ts': 'remove me',
    }, {
      'src/App.vue': 'after',
      'src/new.ts': 'add me',
    })).toEqual({
      writes: {
        'src/App.vue': 'after',
        'src/new.ts': 'add me',
      },
      removals: ['src/old.ts'],
    })
  })

  it('diffs layered snapshots for chapter switches with additions, removals, and base restores', () => {
    expect(diffLayeredSnapshots({
      'src/App.vue': 'base app',
      'src/base-only.ts': 'base only',
    }, {}, {})).toEqual({
      writes: {},
      removals: [],
    })

    expect(diffLayeredSnapshots({
      'src/App.vue': 'base app',
    }, {
      'src/App.vue': 'chapter one',
      'src/old.ts': 'old overlay',
    }, {
      'src/App.vue': 'chapter two',
      'src/new.ts': 'new overlay',
    })).toEqual({
      writes: {
        'src/App.vue': 'chapter two',
        'src/new.ts': 'new overlay',
      },
      removals: ['src/old.ts'],
    })

    expect(diffLayeredSnapshots({
      'src/App.vue': 'base app',
    }, {
      'src/App.vue': 'chapter override',
    }, {})).toEqual({
      writes: {
        'src/App.vue': 'base app',
      },
      removals: [],
    })
  })

  it('plans an exact project sync that preserves node_modules and prunes removable directories', () => {
    expect(planTutorialExactSync({
      'src/App.vue': 'old app',
      'src/main.ts': 'main',
    }, {
      directories: ['.nuxt', 'src', 'src/generated', 'src/generated/cache', 'node_modules'],
      files: ['.nuxt/server.mjs', 'src/App.vue', 'src/generated/cache.json', 'src/main.ts', 'node_modules/.bin/vite'],
    }, {
      'src/App.vue': 'new app',
      'src/main.ts': 'main',
      'src/components/Panel.vue': '<template />',
    }, {
      preservedRootPaths: ['node_modules'],
    })).toEqual({
      writes: {
        'src/App.vue': 'new app',
        'src/components/Panel.vue': '<template />',
      },
      fileRemovals: [],
      directoryRemovals: ['.nuxt', 'src/generated'],
    })
  })

  it('plans file removals for leftover chapter files that are not under removable directories', () => {
    expect(planTutorialExactSync({
      'src/App.vue': 'old app',
      'src/main.ts': 'main',
    }, {
      directories: ['src'],
      files: ['src/App.vue', 'src/main.ts', 'src/leftover.ts'],
    }, {
      'src/App.vue': 'old app',
      'src/main.ts': 'main',
    }, {
      preservedRootPaths: ['node_modules'],
    })).toEqual({
      writes: {},
      fileRemovals: ['src/leftover.ts'],
      directoryRemovals: [],
    })
  })

  it('keys the dependency cache off the lockfile and vendored local package files', () => {
    expect(getTutorialDependencyCacheSignature({
      'package.json': '{"dependencies":{"vue":"^3.5.21"}}',
      'package-lock.json': '{"lockfileVersion":3}',
      'src/main.ts': 'console.log("hello")',
      'vendor/@rstore/vue/package.json': '{"name":"@rstore/vue"}',
      'vendor/@rstore/vue/dist/index.mjs': 'export {}',
    })).toBe(JSON.stringify([
      ['package-lock.json', '{"lockfileVersion":3}'],
      ['package.json', '{"dependencies":{"vue":"^3.5.21"}}'],
      ['vendor/@rstore/vue/dist/index.mjs', 'export {}'],
      ['vendor/@rstore/vue/package.json', '{"name":"@rstore/vue"}'],
    ]))

    expect(getTutorialDependencyCacheSignature({
      'src/main.ts': 'console.log("hello")',
    })).toBeNull()
  })

  it('keeps the dependency signature stable across chapters in the same track', () => {
    const vueSignatures = new Set(resolvedVueChapters.map(chapter =>
      getTutorialDependencyCacheSignature(chapter.starterFiles),
    ))
    const nuxtSignatures = new Set(resolvedNuxtChapters.map(chapter =>
      getTutorialDependencyCacheSignature(chapter.starterFiles),
    ))

    expect(vueSignatures).toEqual(new Set([
      getTutorialDependencyCacheSignature(getFrameworkBaseFiles('vue')),
    ]))
    expect(nuxtSignatures).toEqual(new Set([
      getTutorialDependencyCacheSignature(getFrameworkBaseFiles('nuxt')),
    ]))
  })

  it('keeps read-only overview chapters on the framework base snapshot', () => {
    const vueOverview = resolveChapter('vue-local-first-mental-model')
    const nuxtOverview = resolveChapter('nuxt-runtime-model')

    expect(vueOverview.editableFiles).toEqual([])
    expect(vueOverview.validationAction).toBeUndefined()
    expect(vueOverview.starterFiles).toEqual(getFrameworkBaseFiles('vue'))
    expect(nuxtOverview.editableFiles).toEqual([])
    expect(nuxtOverview.validationAction).toBeUndefined()
    expect(nuxtOverview.starterFiles).toEqual(getFrameworkBaseFiles('nuxt'))
  })

  it('stores dependency cache entries per signature and restores them independently', async () => {
    installFakeIndexedDb()
    const signatureA = 'signature-a'
    const signatureB = 'signature-b'
    const snapshotA = new Uint8Array([1, 2, 3])
    const snapshotB = new Uint8Array([4, 5, 6])
    const sourceA = createMockCacheWebContainer({
      nodeModulesSnapshot: snapshotA,
      packageLock: 'lock-a',
    })
    const sourceB = createMockCacheWebContainer({
      nodeModulesSnapshot: snapshotB,
      packageLock: 'lock-b',
    })

    await saveTutorialDependencyCache(sourceA.webContainer as any, signatureA)
    await saveTutorialDependencyCache(sourceB.webContainer as any, signatureB)

    const restoreA = createMockCacheWebContainer()
    const restoreB = createMockCacheWebContainer()

    await expect(restoreTutorialDependencyCache(restoreA.webContainer as any, signatureA)).resolves.toBe('hit')
    await expect(restoreTutorialDependencyCache(restoreB.webContainer as any, signatureB)).resolves.toBe('hit')
    expect(restoreA.state.mountedSnapshots).toEqual([
      {
        mountPoint: 'node_modules',
        snapshot: snapshotA,
      },
    ])
    expect(restoreB.state.mountedSnapshots).toEqual([
      {
        mountPoint: 'node_modules',
        snapshot: snapshotB,
      },
    ])
    expect(restoreA.state.fsFiles.get('package-lock.json')).toBe('lock-a')
    expect(restoreB.state.fsFiles.get('package-lock.json')).toBe('lock-b')

    await clearTutorialDependencyCache(signatureA)

    const restoreAfterClearA = createMockCacheWebContainer()
    const restoreAfterClearB = createMockCacheWebContainer()
    await expect(restoreTutorialDependencyCache(restoreAfterClearA.webContainer as any, signatureA)).resolves.toBe('miss')
    await expect(restoreTutorialDependencyCache(restoreAfterClearB.webContainer as any, signatureB)).resolves.toBe('hit')
  })

  it('invalidates only the stale dependency cache record that failed to restore', async () => {
    installFakeIndexedDb()
    const staleSignature = 'stale-signature'
    const healthySignature = 'healthy-signature'
    const healthySnapshot = new Uint8Array([9, 9, 9])

    await writeTutorialDependencyCacheRecord(getTutorialDependencyCacheRecordKey(staleSignature), {
      compression: 'gzip',
      dependencySignature: staleSignature,
      nodeModulesSnapshot: new Uint8Array([1, 2, 3]),
      packageLock: 'stale-lock',
      savedAt: Date.now(),
      version: 3,
    })
    await writeTutorialDependencyCacheRecord(getTutorialDependencyCacheRecordKey(healthySignature), {
      compression: 'none',
      dependencySignature: healthySignature,
      nodeModulesSnapshot: healthySnapshot,
      packageLock: 'healthy-lock',
      savedAt: Date.now(),
      version: 3,
    })

    const staleRestore = createMockCacheWebContainer()
    const healthyRestore = createMockCacheWebContainer()

    await expect(restoreTutorialDependencyCache(staleRestore.webContainer as any, staleSignature)).resolves.toBe('stale')
    expect(staleRestore.state.removedPaths).toEqual(['node_modules'])
    await expect(restoreTutorialDependencyCache(healthyRestore.webContainer as any, healthySignature)).resolves.toBe('hit')
    expect(healthyRestore.state.mountedSnapshots).toEqual([
      {
        mountPoint: 'node_modules',
        snapshot: healthySnapshot,
      },
    ])
  })

  it('prefers npm ci when the tutorial snapshot includes a lockfile', () => {
    expect(createTutorialDependencyInstallPlan({
      'package.json': '{"name":"tutorial"}',
      'package-lock.json': '{"lockfileVersion":3}',
    })).toEqual({
      primary: {
        args: ['ci', '--no-audit', '--prefer-offline'],
        label: 'npm ci --no-audit --prefer-offline',
      },
      fallback: {
        args: ['install', '--no-audit'],
        label: 'npm install --no-audit',
      },
    })
  })

  it('falls back to npm install when there is no tutorial lockfile', () => {
    expect(createTutorialDependencyInstallPlan({
      'package.json': '{"name":"tutorial"}',
    })).toEqual({
      primary: {
        args: ['install', '--no-audit'],
        label: 'npm install --no-audit',
      },
      fallback: null,
    })
  })

  it('groups chapters in stable group and index order', () => {
    expect(groupTutorialChapters(resolvedVueChapters).map(group => group.group)).toEqual([
      'Foundations',
      'Reading Data',
      'Writing Data',
      'Modeling',
      'Reactivity',
      'Beyond the Basics',
    ])
    expect(groupTutorialChapters(resolvedNuxtChapters).map(group => group.group)).toEqual([
      'Foundations',
      'Reading Data',
      'Writing Data',
      'Modeling',
      'Reactivity',
      'Beyond the Basics',
    ])
  })

  it('finds previous and next chapters for boundaries and middle chapters', () => {
    expect(getAdjacentTutorialChapters(resolvedVueChapters, 0)).toEqual({
      previous: null,
      next: {
        index: 1,
        chapter: resolvedVueChapters[1],
      },
    })

    expect(getAdjacentTutorialChapters(resolvedNuxtChapters, 4)).toEqual({
      previous: {
        index: 3,
        chapter: resolvedNuxtChapters[3],
      },
      next: {
        index: 5,
        chapter: resolvedNuxtChapters[5],
      },
    })

    expect(getAdjacentTutorialChapters(resolvedVueChapters, resolvedVueChapters.length - 1)).toEqual({
      previous: {
        index: resolvedVueChapters.length - 2,
        chapter: resolvedVueChapters[resolvedVueChapters.length - 2],
      },
      next: null,
    })
  })

  it('shows editable files first and keeps chapter-local source files as read-only context', () => {
    const chapter = resolveChapter('vue-extract-plugin')

    expect(getTutorialChapterEditorFiles(chapter)).toEqual([
      'src/rstore/schema.ts',
      'src/rstore/memoryPlugin.ts',
      'src/rstore/index.ts',
      'src/rstore/relations.ts',
      'src/rstore/types.ts',
      'src/main.ts',
    ])
  })

  it('excludes unrelated chapter files from the read-only editor context', () => {
    const chapter = resolveChapter('vue-extract-plugin')

    expect(getTutorialChapterEditorFiles(chapter)).not.toContain('src/components/CachePanel.vue')
    expect(getTutorialChapterEditorFiles(chapter)).not.toContain('src/components/TodoForm.vue')
  })

  it('keeps component chapters focused on files connected to the edited component', () => {
    const chapter = resolveChapter('vue-form-objects')

    expect(getTutorialChapterEditorFiles(chapter)).toEqual([
      'src/components/TodoForm.vue',
      'src/components/TutorialContent.vue',
      'src/App.vue',
      'src/main.ts',
    ])
  })

  it('marks only the newest latest-request token as current', () => {
    const controller = createLatestRequestController()
    const first = controller.issue()
    const second = controller.issue()

    expect(controller.isCurrent(first)).toBe(false)
    expect(controller.isCurrent(second)).toBe(true)
  })

  it('treats stale preview state updates as outdated when the preview session changes', () => {
    expect(isTutorialPreviewSessionCurrent('session-b', 'session-a')).toBe(false)
    expect(isTutorialPreviewSessionCurrent('session-b', 'session-b')).toBe(true)
  })

  it('treats stale preview request responses as outdated when the preview session changes', () => {
    expect(isTutorialPreviewSessionCurrent('session-2', 'session-1')).toBe(false)
    expect(isTutorialPreviewSessionCurrent(null, 'session-2')).toBe(false)
  })

  it('invalidates stale runtime sessions and reports cancellation distinctly', () => {
    const controller = createTutorialRuntimeSessionController()
    const first = controller.issue()
    const second = controller.invalidate()

    expect(controller.current).toBe(second)
    expect(controller.isCurrent(first)).toBe(false)
    expect(controller.isCurrent(second)).toBe(true)

    expect(() => controller.throwIfStale(first)).toThrowError('The tutorial runtime session was cancelled.')

    try {
      controller.throwIfStale(first)
    }
    catch (error) {
      expect(isTutorialRuntimeCancellationError(error)).toBe(true)
    }

    expect(() => controller.throwIfStale(second)).not.toThrow()
  })

  it('invalidates stale chapter tasks and keeps only the newest chapter token current', () => {
    const controller = createTutorialChapterTaskSessionController()
    const first = controller.issue()
    const second = controller.issue()

    expect(controller.current).toBe(second)
    expect(controller.isCurrent(first)).toBe(false)
    expect(controller.isCurrent(second)).toBe(true)
    expect(() => controller.throwIfStale(first)).toThrowError('The tutorial chapter task was cancelled.')
    expect(() => controller.throwIfStale(second)).not.toThrow()
  })

  it('treats chapter-task cancellation separately from runtime cancellation so dependency installs can continue', () => {
    const runtimeController = createTutorialRuntimeSessionController()
    const chapterController = createTutorialChapterTaskSessionController()
    const runtimeToken = runtimeController.issue()
    const staleChapterToken = chapterController.issue()
    const latestChapterToken = chapterController.issue()

    expect(runtimeController.isCurrent(runtimeToken)).toBe(true)
    expect(() => runtimeController.throwIfStale(runtimeToken)).not.toThrow()
    expect(chapterController.isCurrent(latestChapterToken)).toBe(true)

    try {
      chapterController.throwIfStale(staleChapterToken)
    }
    catch (error) {
      expect(isTutorialChapterTaskCancellationError(error)).toBe(true)
      expect(isTutorialRuntimeCancellationError(error)).toBe(false)
    }

    expect(() => runtimeController.throwIfStale(runtimeToken)).not.toThrow()
  })

  it('finds the first differing editable file and applies only editable corrections', () => {
    const chapter = resolveChapter('vue-extract-plugin')
    const userFiles = {
      'src/rstore/schema.ts': 'custom schema',
      'src/rstore/memoryPlugin.ts': chapter.solutionFiles['src/rstore/memoryPlugin.ts'],
      'src/App.vue': 'should stay untouched',
    }

    expect(getDifferingEditableFiles(chapter, userFiles)).toEqual(['src/rstore/schema.ts'])
    expect(getPrimaryCorrectionFile(chapter, userFiles)).toBe('src/rstore/schema.ts')

    const corrected = applyStepCorrections(chapter, userFiles)

    expect(corrected['src/rstore/schema.ts']).toBe(chapter.solutionFiles['src/rstore/schema.ts'])
    expect(corrected['src/rstore/memoryPlugin.ts']).toBe(chapter.solutionFiles['src/rstore/memoryPlugin.ts'])
    expect(corrected['src/App.vue']).toBe('should stay untouched')
  })

  it('reuses open tabs by file path and surfaces current chapter files first', () => {
    const openFiles = mergeTutorialOpenFiles(
      ['src/rstore/schema.ts', 'src/rstore/memoryPlugin.ts'],
      ['src/rstore/memoryPlugin.ts', 'src/components/TutorialContent.vue'],
    )

    expect(openFiles).toEqual([
      'src/rstore/schema.ts',
      'src/rstore/memoryPlugin.ts',
      'src/components/TutorialContent.vue',
    ])

    expect(prioritizeTutorialOpenFiles(openFiles, ['src/rstore/memoryPlugin.ts', 'src/components/TutorialContent.vue'])).toEqual([
      'src/rstore/memoryPlugin.ts',
      'src/components/TutorialContent.vue',
      'src/rstore/schema.ts',
    ])
  })

  it('builds a nested tutorial file tree with stable ordering and readonly metadata', () => {
    const tree = buildTutorialFileTree([
      'src/rstore/schema.ts',
      'src/rstore/memoryPlugin.ts',
      'src/App.vue',
      'src/components/TutorialContent.vue',
      'src/components/TodoForm.vue',
    ], [
      'src/rstore/schema.ts',
      'src/components/TutorialContent.vue',
    ], 'src/components/TodoForm.vue')

    expect(tree.folderPaths).toEqual([
      'src',
      'src/components',
      'src/rstore',
    ])
    expect(tree.selectedAncestorPaths).toEqual([
      'src',
      'src/components',
    ])
    expect(tree.nodes).toEqual([
      {
        type: 'folder',
        name: 'src',
        path: 'src',
        children: [
          {
            type: 'folder',
            name: 'components',
            path: 'src/components',
            children: [
              {
                type: 'file',
                name: 'TutorialContent.vue',
                path: 'src/components/TutorialContent.vue',
                editable: true,
                icon: 'file-icons:vue',
                iconClass: 'text-emerald-500 dark:text-emerald-400',
              },
              {
                type: 'file',
                name: 'TodoForm.vue',
                path: 'src/components/TodoForm.vue',
                editable: false,
                icon: 'file-icons:vue',
                iconClass: 'text-emerald-500 dark:text-emerald-400',
              },
            ],
          },
          {
            type: 'folder',
            name: 'rstore',
            path: 'src/rstore',
            children: [
              {
                type: 'file',
                name: 'schema.ts',
                path: 'src/rstore/schema.ts',
                editable: true,
                icon: 'file-icons:typescript',
                iconClass: 'text-sky-500 dark:text-sky-400',
              },
              {
                type: 'file',
                name: 'memoryPlugin.ts',
                path: 'src/rstore/memoryPlugin.ts',
                editable: false,
                icon: 'file-icons:typescript',
                iconClass: 'text-sky-500 dark:text-sky-400',
              },
            ],
          },
          {
            type: 'file',
            name: 'App.vue',
            path: 'src/App.vue',
            editable: false,
            icon: 'file-icons:vue',
            iconClass: 'text-emerald-500 dark:text-emerald-400',
          },
        ],
      },
    ])
  })

  it('keeps a readonly context file selected when it still exists in the editor file set', () => {
    expect(resolveTutorialSelectedFile(
      'src/main.ts',
      ['src/components/TutorialContent.vue', 'src/App.vue', 'src/main.ts'],
      ['src/components/TutorialContent.vue'],
    )).toBe('src/main.ts')

    expect(resolveTutorialSelectedFile(
      'src/missing.ts',
      ['src/components/TutorialContent.vue', 'src/App.vue', 'src/main.ts'],
      ['src/components/TutorialContent.vue'],
    )).toBe('src/components/TutorialContent.vue')
  })

  it('resolves the selected file per chapter so chapter switches fall back to the new chapter file', () => {
    const selectedFilesByChapter = {
      'vue-query-list': 'src/main.ts',
    }

    expect(resolveTutorialChapterSelectedFile(
      'vue-query-list',
      selectedFilesByChapter,
      ['src/components/TutorialContent.vue', 'src/App.vue', 'src/main.ts'],
      ['src/components/TutorialContent.vue'],
    )).toBe('src/main.ts')

    expect(resolveTutorialChapterSelectedFile(
      'vue-create-todos',
      selectedFilesByChapter,
      ['src/components/TutorialContent.vue', 'src/App.vue', 'src/main.ts'],
      ['src/components/TutorialContent.vue'],
    )).toBe('src/components/TutorialContent.vue')
  })

  it('reports browser support errors for missing SharedArrayBuffer or isolation', () => {
    expect(detectTutorialSupport(globalThis)).toEqual({
      supported: false,
      reason: 'The interactive tutorial only runs in a browser.',
      needsCrossOriginIsolation: false,
    })

    expect(detectTutorialSupport({
      window: {} as Window,
      crossOriginIsolated: false,
    } as Window & typeof globalThis)).toEqual({
      supported: false,
      reason: 'This browser does not expose SharedArrayBuffer, which WebContainers require.',
      needsCrossOriginIsolation: false,
    })

    expect(detectTutorialSupport({
      window: {} as Window,
      SharedArrayBuffer,
      crossOriginIsolated: false,
    } as Window & typeof globalThis)).toEqual({
      supported: false,
      reason: 'Cross-origin isolation is not enabled for this page.',
      needsCrossOriginIsolation: true,
    })
  })

  it('tracks tutorial server URLs by port and maps websocket endpoints', async () => {
    const tracker = createTutorialServerTracker()
    const previewWait = tracker.waitFor(getTutorialRuntimeProfile('vue').port)
    const lspWait = tracker.waitFor(3030)
    const nuxtPreviewWait = tracker.waitFor(getTutorialRuntimeProfile('nuxt').port)

    tracker.markReady(3030, 'http://127.0.0.1:3030')
    tracker.markReady(getTutorialRuntimeProfile('vue').port, 'https://127.0.0.1:4173')
    tracker.markReady(getTutorialRuntimeProfile('nuxt').port, 'https://127.0.0.1:3000')

    await expect(previewWait).resolves.toBe('https://127.0.0.1:4173')
    await expect(lspWait).resolves.toBe('http://127.0.0.1:3030')
    await expect(nuxtPreviewWait).resolves.toBe('https://127.0.0.1:3000')
  })

  it('keeps chapter copy in the toolbar, intro, validation, correction dialog, and guide footer', () => {
    const toolbarSource = readFileSync(resolve(process.cwd(), 'docs/components/tutorial/TutorialToolbar.vue'), 'utf8')
    const trackPickerSource = readFileSync(resolve(process.cwd(), 'docs/components/tutorial/TutorialTrackPicker.vue'), 'utf8')
    const introSource = readFileSync(resolve(process.cwd(), 'docs/components/tutorial/TutorialIntro.vue'), 'utf8')
    const validationSource = readFileSync(resolve(process.cwd(), 'docs/components/tutorial/TutorialValidationPanel.vue'), 'utf8')
    const correctionSource = readFileSync(resolve(process.cwd(), 'docs/components/tutorial/TutorialCorrectionDialog.vue'), 'utf8')
    const guideSource = readFileSync(resolve(process.cwd(), 'docs/components/tutorial/TutorialStepGuide.vue'), 'utf8')

    expect(toolbarSource).toContain('Chapter {{ props.chapterIndex }} / {{ props.totalChapters }}')
    expect(toolbarSource).not.toContain(':disabled="isBusy"')
    expect(trackPickerSource).not.toContain(':disabled="isBusy"')
    expect(introSource).toContain('Each chapter restores its own files')
    expect(validationSource).toContain('Check this chapter when you are ready.')
    expect(validationSource).toContain('Next chapter')
    expect(correctionSource).toContain('expected solution for this chapter')
    expect(guideSource).not.toContain('Ready to keep moving?')
    expect(guideSource).toContain('Previous chapter')
    expect(guideSource).toContain('Next chapter')
  })
})
