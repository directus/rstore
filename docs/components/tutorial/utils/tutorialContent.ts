import type { TutorialChapter, TutorialFramework, TutorialSnapshot, TutorialTrackContent, TutorialTrackSummary } from './types'
import {
  getTutorialChapterDefinitions,
  tutorialChapterFolders,
  tutorialTracks as tutorialTrackDefinitions,
} from '../steps/registry'
import { getStepRuntimeAssets, getStepSolutionFiles, getStepStarterFiles } from './tutorialAssets'
import { tutorialFrameworks } from './tutorialFrameworkState'
import { getChapterGuideComponent, getChapterGuideSearchText } from './tutorialGuides'

export const tutorialTracks = tutorialTrackDefinitions

export const tutorialTrackContent = Object.fromEntries(
  tutorialFrameworks.map((framework) => {
    const track = tutorialTrackDefinitions[framework]

    return [framework, {
      ...track,
      chapters: resolveTrackChapters(framework),
    } satisfies TutorialTrackContent]
  }),
) as Record<TutorialFramework, TutorialTrackContent>

export const tutorialTrackSummaries = tutorialFrameworks.map((framework) => {
  const { chapters, ...track } = tutorialTrackContent[framework]

  return {
    ...track,
    chapterCount: chapters.length,
  } satisfies TutorialTrackSummary
})

export const tutorialStepsByFramework = Object.fromEntries(
  Object.entries(tutorialTrackContent).map(([framework, track]) => [framework, track.chapters]),
) as Record<TutorialFramework, TutorialChapter[]>

export function getTutorialChapters(framework: TutorialFramework) {
  return tutorialStepsByFramework[framework]
}

function resolveTrackChapters(framework: TutorialFramework): TutorialChapter[] {
  return getTutorialChapterDefinitions(framework).map((chapter) => {
    const sourceChapterId = chapter.playgroundSourceChapterId
    const sourceRuntimeAssets = getStepRuntimeAssets(sourceChapterId ?? chapter.id)
    const sourceStarterFiles = getStepStarterFiles(sourceChapterId ?? chapter.id)
    const sourceSolutionFiles = getStepSolutionFiles(sourceChapterId ?? chapter.id)
    const editableFiles = sourceChapterId
      ? getTutorialPlaygroundEditableFiles(sourceSolutionFiles, framework)
      : chapter.editableFiles
    const runtimeAssets = sourceChapterId
      ? {
          frameworkBaseFiles: sourceRuntimeAssets.frameworkBaseFiles,
          starterOverlayFiles: { ...sourceRuntimeAssets.solutionOverlayFiles },
          solutionOverlayFiles: { ...sourceRuntimeAssets.solutionOverlayFiles },
        }
      : sourceRuntimeAssets
    const starterFiles = sourceChapterId
      ? { ...sourceSolutionFiles }
      : sourceStarterFiles
    const solutionFiles = sourceChapterId
      ? { ...sourceSolutionFiles }
      : sourceSolutionFiles

    return {
      ...chapter,
      editableFiles,
      folder: tutorialChapterFolders[chapter.id],
      runtimeAssets,
      starterFiles,
      solutionFiles,
      guideComponent: getChapterGuideComponent(chapter.id),
      guideSearchText: getChapterGuideSearchText(chapter.id),
    }
  })
}

function getTutorialPlaygroundEditableFiles(files: TutorialSnapshot, framework: TutorialFramework) {
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
