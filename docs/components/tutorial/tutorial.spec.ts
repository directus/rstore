import type { TutorialChapter, TutorialFramework } from './utils/types'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as shared from './steps/shared'
import {
  getTutorialChapterDefinitions,
  tutorialChapterDefinitions,
  tutorialChapterDefinitionsByFramework,
  tutorialChapterFolders,
  tutorialChapterFoldersByFramework,
  tutorialTracks,
} from './steps/registry'
import {
  applyStepCorrections,
  buildTutorialFileTree,
  composeStepSnapshot,
  composeVisibleStepSnapshot,
  createLatestRequestController,
  createTutorialSearchSegments,
  createTutorialSearchSnippet,
  detectTutorialSupport,
  diffSnapshots,
  getAdjacentTutorialChapters,
  getDifferingEditableFiles,
  getPrimaryCorrectionFile,
  getTutorialChapterEditorFiles,
  groupTutorialChapters,
  mergeTutorialOpenFiles,
  normalizeTutorialGuideSearchText,
  prioritizeTutorialOpenFiles,
  resetStepFiles,
  resolveTutorialChapterSelectedFile,
  resolveTutorialSelectedFile,
} from './utils'
import { getStepSolutionFiles, getStepStarterFiles } from './utils/tutorialAssets'
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
  createTutorialRuntimeSessionController,
  isTutorialRuntimeCancellationError,
} from './utils/tutorialRuntimeSession'
import { createTutorialServerTracker, getTutorialRuntimeProfile } from './utils/tutorialServerUrls'
import { getTutorialDependencyCacheSignature } from './utils/webContainerCache'

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

  return {
    ...definition,
    folder: tutorialChapterFolders[chapterId],
    starterFiles: getStepStarterFiles(chapterId),
    solutionFiles: getStepSolutionFiles(chapterId),
    guideComponent: {} as TutorialChapter['guideComponent'],
    guideSearchText: normalizeTutorialGuideSearchText(readFileSync(routeToTutorialGuide(tutorialChapterFolders[chapterId]), 'utf8')),
  }
}

function resolveTrackChapters(framework: TutorialFramework) {
  return getTutorialChapterDefinitions(framework).map(definition => resolveChapter(definition.id))
}

const resolvedVueChapters = resolveTrackChapters('vue')
const resolvedNuxtChapters = resolveTrackChapters('nuxt')

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
    expect(tutorialChapterDefinitionsByFramework.vue).toHaveLength(10)
    expect(tutorialChapterDefinitionsByFramework.nuxt).toHaveLength(9)
    expect(tutorialChapterDefinitionsByFramework.vue.some(chapter => chapter.id === 'vue-project-tour')).toBe(false)
    expect(tutorialChapterDefinitionsByFramework.nuxt.some(chapter => chapter.id === 'nuxt-server-api-routes')).toBe(false)
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
    expect(vueQueryStarter['src/App.vue']).toContain('No todos are showing yet.')
    expect(vueQuerySolution['src/App.vue']).toContain('The list, loading badge, and refresh button now all come from one reactive query.')

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

  it('maps every framework chapter id to a stable tutorial folder', () => {
    expect(tutorialTracks.vue.runtimePort).toBe(4173)
    expect(tutorialTracks.nuxt.runtimePort).toBe(3000)
    expect(tutorialChapterFolders['vue-welcome']).toBe('vue/01-welcome')
    expect(tutorialChapterFolders['vue-define-collections']).toBe('vue/02-define-collections')
    expect(tutorialChapterFolders['vue-cache-apis']).toBe('vue/13-cache-apis')
    expect(tutorialChapterFolders['nuxt-welcome']).toBe('nuxt/01-welcome')
    expect(tutorialChapterFolders['nuxt-cache-apis']).toBe('nuxt/13-cache-apis')
    expect(Object.keys(tutorialChapterFoldersByFramework.vue)).toHaveLength(10)
    expect(Object.keys(tutorialChapterFoldersByFramework.nuxt)).toHaveLength(9)
    expect(tutorialChapterFoldersByFramework.nuxt['nuxt-server-api-routes']).toBeUndefined()
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
    expect(resetFiles['src/App.vue']).toBe(chapter.starterFiles['src/App.vue'])
  })

  it('builds a full snapshot by overlaying the current editable files', () => {
    const chapter = resolveChapter('vue-query-list')
    const currentFiles = {
      'src/App.vue': 'changed app content',
    }

    const snapshot = composeStepSnapshot(chapter, currentFiles)

    expect(snapshot['src/App.vue']).toBe('changed app content')
    expect(snapshot['src/main.ts']).toBe(chapter.starterFiles['src/main.ts'])
  })

  it('builds a narrowed snapshot for the currently visible files', () => {
    const chapter = resolveChapter('vue-query-list')
    const snapshot = composeVisibleStepSnapshot(chapter, {
      'src/App.vue': 'changed app content',
    }, [
      'src/App.vue',
      'src/main.ts',
      'src/missing.ts',
    ])

    expect(snapshot).toEqual({
      'src/App.vue': 'changed app content',
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
    ])
    expect(groupTutorialChapters(resolvedNuxtChapters).map(group => group.group)).toEqual([
      'Foundations',
      'Reading Data',
      'Writing Data',
      'Modeling',
      'Reactivity',
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
      ['src/rstore/memoryPlugin.ts', 'src/App.vue'],
    )

    expect(openFiles).toEqual([
      'src/rstore/schema.ts',
      'src/rstore/memoryPlugin.ts',
      'src/App.vue',
    ])

    expect(prioritizeTutorialOpenFiles(openFiles, ['src/rstore/memoryPlugin.ts', 'src/App.vue'])).toEqual([
      'src/rstore/memoryPlugin.ts',
      'src/App.vue',
      'src/rstore/schema.ts',
    ])
  })

  it('builds a nested tutorial file tree with stable ordering and readonly metadata', () => {
    const tree = buildTutorialFileTree([
      'src/rstore/schema.ts',
      'src/rstore/memoryPlugin.ts',
      'src/App.vue',
      'src/components/TodoForm.vue',
    ], [
      'src/rstore/schema.ts',
      'src/App.vue',
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
            editable: true,
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
      ['src/App.vue', 'src/main.ts'],
      ['src/App.vue'],
    )).toBe('src/main.ts')

    expect(resolveTutorialSelectedFile(
      'src/missing.ts',
      ['src/App.vue', 'src/main.ts'],
      ['src/App.vue'],
    )).toBe('src/App.vue')
  })

  it('resolves the selected file per chapter so chapter switches fall back to the new chapter file', () => {
    const selectedFilesByChapter = {
      'vue-query-list': 'src/main.ts',
    }

    expect(resolveTutorialChapterSelectedFile(
      'vue-query-list',
      selectedFilesByChapter,
      ['src/App.vue', 'src/main.ts'],
      ['src/App.vue'],
    )).toBe('src/main.ts')

    expect(resolveTutorialChapterSelectedFile(
      'vue-create-todos',
      selectedFilesByChapter,
      ['src/App.vue', 'src/components/TodoForm.vue'],
      ['src/App.vue', 'src/components/TodoForm.vue'],
    )).toBe('src/App.vue')
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
