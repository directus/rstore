import type { TutorialChapter, TutorialFramework, TutorialTrackContent, TutorialTrackSummary } from './types'
import {
  getTutorialChapterDefinitions,
  tutorialChapterFolders,
  tutorialTracks as tutorialTrackDefinitions,
} from '../steps/registry'
import { getStepSolutionFiles, getStepStarterFiles } from './tutorialAssets'
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
  return getTutorialChapterDefinitions(framework).map(chapter => ({
    ...chapter,
    folder: tutorialChapterFolders[chapter.id],
    starterFiles: getStepStarterFiles(chapter.id),
    solutionFiles: getStepSolutionFiles(chapter.id),
    guideComponent: getChapterGuideComponent(chapter.id),
    guideSearchText: getChapterGuideSearchText(chapter.id),
  }))
}
