import type { TutorialSnapshot } from './types'
import type { TutorialFramework } from './types'
import { tutorialChapterFolders, tutorialChapterFoldersByFramework } from '../steps/registry'
import { createVendoredRstorePackageFiles } from './tutorialLocalPackages'

const baseAssetModules = import.meta.glob('../../../.vitepress/tutorial/*/+assets/base/**/*', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const sharedAssetModules = import.meta.glob('../../../.vitepress/tutorial/*/*/+assets/shared/**/*', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const starterAssetModules = import.meta.glob('../../../.vitepress/tutorial/*/*/+assets/app-a/**/*', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const solutionAssetModules = import.meta.glob('../../../.vitepress/tutorial/*/*/+assets/app-b/**/*', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

function createSnapshotFromModules(modules: Record<string, string>, marker: string): TutorialSnapshot {
  return Object.entries(modules).reduce<TutorialSnapshot>((snapshot, [modulePath, content]) => {
    const index = modulePath.indexOf(marker)

    if (index === -1)
      return snapshot

    snapshot[modulePath.slice(index + marker.length)] = content
    return snapshot
  }, {})
}

function createStepSnapshot(folder: string, modules: Record<string, string>, kind: 'shared' | 'app-a' | 'app-b'): TutorialSnapshot {
  return createSnapshotFromModules(modules, `/${folder}/+assets/${kind}/`)
}

const frameworkBaseFiles = Object.fromEntries(
  (Object.entries(tutorialChapterFoldersByFramework) as [TutorialFramework, Record<string, string>][])
    .map(([framework]) => [
      framework,
      {
        ...createSnapshotFromModules(baseAssetModules, `/${framework}/+assets/base/`),
        ...createVendoredRstorePackageFiles(framework),
      },
    ]),
) as Record<TutorialFramework, TutorialSnapshot>

const starterFilesByStep = Object.fromEntries(
  Object.entries(tutorialChapterFolders).map(([stepId, folder]) => [
    stepId,
    {
      ...frameworkBaseFiles[getFrameworkFromFolder(folder)],
      ...createStepSnapshot(folder, sharedAssetModules, 'shared'),
      ...createStepSnapshot(folder, starterAssetModules, 'app-a'),
    },
  ]),
) as Record<string, TutorialSnapshot>

const solutionFilesByStep = Object.fromEntries(
  Object.entries(tutorialChapterFolders).map(([stepId, folder]) => [
    stepId,
    {
      ...frameworkBaseFiles[getFrameworkFromFolder(folder)],
      ...createStepSnapshot(folder, sharedAssetModules, 'shared'),
      ...createStepSnapshot(folder, solutionAssetModules, 'app-b'),
    },
  ]),
) as Record<string, TutorialSnapshot>

function getStepStarterFiles(stepId: string): TutorialSnapshot {
  return starterFilesByStep[stepId] ?? {}
}

function getStepSolutionFiles(stepId: string): TutorialSnapshot {
  return solutionFilesByStep[stepId] ?? {}
}

function getFrameworkFromFolder(folder: string): TutorialFramework {
  return folder.startsWith('nuxt/') ? 'nuxt' : 'vue'
}

export {
  getStepSolutionFiles,
  getStepStarterFiles,
}
