import type { TutorialStep } from './utils/types'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tutorialStepDefinitions, tutorialStepFolders } from './steps/registry'
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
} from './utils'
import { getStepSolutionFiles, getStepStarterFiles } from './utils/tutorialAssets'
import { createVendoredRstorePackageFiles } from './utils/tutorialLocalPackages'
import { createTutorialServerTracker } from './utils/tutorialServerUrls'
import { getTutorialDependencyCacheSignature } from './utils/webContainerCache'

function routeToDocFile(route: string): string {
  return resolve(process.cwd(), 'docs', `${route.replace(/^\//, '')}.md`)
}

function routeToTutorialGuide(folder: string): string {
  return resolve(process.cwd(), 'docs', '.vitepress', 'tutorial', folder, 'index.md')
}

function resolveStep(stepId: string): TutorialStep {
  const definition = tutorialStepDefinitions.find(step => step.id === stepId)

  if (!definition)
    throw new Error(`Unknown tutorial step: ${stepId}`)

  return {
    ...definition,
    folder: tutorialStepFolders[stepId],
    starterFiles: getStepStarterFiles(stepId),
    solutionFiles: getStepSolutionFiles(stepId),
    guideComponent: {} as TutorialStep['guideComponent'],
  }
}

describe('interactive tutorial steps', () => {
  it('vendors local rstore package builds into the base tutorial snapshot', () => {
    const files = createVendoredRstorePackageFiles()
    const vueManifest = JSON.parse(files['vendor/@rstore/vue/package.json']!)

    expect(files['vendor/@rstore/shared/dist/index.d.ts']).toBeTypeOf('string')
    expect(files['vendor/@rstore/core/dist/index.mjs']).toBeTypeOf('string')
    expect(files['vendor/@rstore/vue/dist/index.cjs']).toBeTypeOf('string')
    expect(vueManifest.dependencies).toMatchObject({
      '@rstore/core': 'file:../core',
      '@rstore/shared': 'file:../shared',
    })
  })

  it('keeps step metadata complete and resolves assets from tutorial content folders', () => {
    const ids = new Set<string>()

    for (const definition of tutorialStepDefinitions) {
      const step = resolveStep(definition.id)
      expect(ids.has(step.id)).toBe(false)
      ids.add(step.id)

      expect(step.editableFiles.length).toBeGreaterThan(0)
      expect(step.referenceLinks.length).toBeGreaterThan(0)
      for (const link of step.referenceLinks) {
        expect(link.label.length).toBeGreaterThan(0)
        expect(existsSync(routeToDocFile(link.href))).toBe(true)
      }
      expect(existsSync(routeToTutorialGuide(step.folder))).toBe(true)

      for (const editableFile of step.editableFiles) {
        expect(step.starterFiles[editableFile]).toBeTypeOf('string')
        expect(step.solutionFiles[editableFile]).toBeTypeOf('string')
      }
    }
  })

  it('includes base assets and step overlays in resolved snapshots', () => {
    const queryStarter = getStepStarterFiles('query')
    const querySolution = getStepSolutionFiles('query')
    const tutorialManifest = JSON.parse(queryStarter['package.json']!)

    expect(queryStarter['package.json']).toBeTypeOf('string')
    expect(tutorialManifest.dependencies['@rstore/vue']).toBe('file:./vendor/@rstore/vue')
    expect(tutorialManifest.devDependencies['@vue/typescript-plugin']).toBe('^3.2.5')
    expect(tutorialManifest.devDependencies['typescript-language-server']).toBe('^5.0.1')
    expect(queryStarter['src/env.d.ts']).toContain(`declare module '*.vue'`)
    expect(queryStarter['src/tutorial/backend.ts']).toBeTypeOf('string')
    expect(queryStarter['src/rstore/schema.ts']).toBeTypeOf('string')
    expect(queryStarter['vendor/@rstore/vue/package.json']).toBeTypeOf('string')
    expect(queryStarter['src/App.vue']).toContain('Your query is still returning an empty list.')
    expect(querySolution['src/App.vue']).toContain('Reactive queries keep the list in sync with the normalized cache.')

    expect(Object.keys(queryStarter).some(filePath => filePath.includes('+assets'))).toBe(false)
  })

  it('keeps step-local shared files in both starter and solution snapshots', () => {
    const pluginStarter = getStepStarterFiles('plugin-setup')
    const pluginSolution = getStepSolutionFiles('plugin-setup')

    expect(pluginStarter['src/rstore/schema.ts']).toBe(pluginSolution['src/rstore/schema.ts'])
    expect(pluginStarter['src/rstore/index.ts']).toBe(pluginSolution['src/rstore/index.ts'])
    expect(pluginStarter['src/rstore/memoryPlugin.ts']).not.toBe(pluginSolution['src/rstore/memoryPlugin.ts'])
  })

  it('maps every step id to a stable tutorial folder', () => {
    expect(tutorialStepFolders).toEqual({
      'collections': '01-collections',
      'store-setup': '02-store-setup',
      'query': '03-query',
      'mutation': '04-mutation',
      'forms': '05-forms',
      'relations': '06-relations',
      'plugin-setup': '07-plugin-setup',
      'live-query': '08-live-query',
      'cache': '09-cache',
    })
  })

  it('resets a step back to its editable starter files only', () => {
    const step = resolveStep('mutation')
    const resetFiles = resetStepFiles(step)

    expect(Object.keys(resetFiles)).toEqual(step.editableFiles)
    expect(resetFiles['src/App.vue']).toBe(step.starterFiles['src/App.vue'])
  })

  it('builds a full snapshot by overlaying the current editable files', () => {
    const step = resolveStep('query')
    const currentFiles = {
      'src/App.vue': 'changed app content',
    }

    const snapshot = composeStepSnapshot(step, currentFiles)

    expect(snapshot['src/App.vue']).toBe('changed app content')
    expect(snapshot['src/main.ts']).toBe(step.starterFiles['src/main.ts'])
  })

  it('builds a narrowed snapshot for the currently visible files', () => {
    const step = resolveStep('query')
    const snapshot = composeVisibleStepSnapshot(step, {
      'src/App.vue': 'changed app content',
    }, [
      'src/App.vue',
      'src/main.ts',
      'src/missing.ts',
    ])

    expect(snapshot).toEqual({
      'src/App.vue': 'changed app content',
      'src/main.ts': step.starterFiles['src/main.ts'],
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

  it('keys the dependency cache off package manifests only', () => {
    expect(getTutorialDependencyCacheSignature({
      'package.json': '{"dependencies":{"vue":"^3.5.21"}}',
      'src/main.ts': 'console.log("hello")',
      'vendor/@rstore/vue/package.json': '{"name":"@rstore/vue"}',
      'vendor/@rstore/vue/dist/index.mjs': 'export {}',
    })).toBe(JSON.stringify([
      ['package.json', '{"dependencies":{"vue":"^3.5.21"}}'],
      ['vendor/@rstore/vue/package.json', '{"name":"@rstore/vue"}'],
    ]))

    expect(getTutorialDependencyCacheSignature({
      'src/main.ts': 'console.log("hello")',
    })).toBeNull()
  })

  it('finds the first differing editable file and applies only editable corrections', () => {
    const step = resolveStep('plugin-setup')
    const userFiles = {
      'src/rstore/schema.ts': 'custom schema',
      'src/rstore/memoryPlugin.ts': step.solutionFiles['src/rstore/memoryPlugin.ts'],
      'src/App.vue': 'should stay untouched',
    }

    expect(getDifferingEditableFiles(step, userFiles)).toEqual(['src/rstore/schema.ts'])
    expect(getPrimaryCorrectionFile(step, userFiles)).toBe('src/rstore/schema.ts')

    const corrected = applyStepCorrections(step, userFiles)

    expect(corrected['src/rstore/schema.ts']).toBe(step.solutionFiles['src/rstore/schema.ts'])
    expect(corrected['src/rstore/memoryPlugin.ts']).toBe(step.solutionFiles['src/rstore/memoryPlugin.ts'])
    expect(corrected['src/App.vue']).toBe('should stay untouched')
  })

  it('reuses open tabs by file path and surfaces current step files first', () => {
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
    const previewWait = tracker.waitFor(4173)
    const lspWait = tracker.waitFor(3030)

    tracker.markReady(3030, 'http://127.0.0.1:3030')
    tracker.markReady(4173, 'https://127.0.0.1:4173')

    await expect(previewWait).resolves.toBe('https://127.0.0.1:4173')
    await expect(lspWait).resolves.toBe('http://127.0.0.1:3030')
  })
})
