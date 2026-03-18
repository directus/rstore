import type { TutorialChapterDefinition, TutorialFramework, TutorialTrackDefinition } from '../utils/types'
import { nuxtTutorialChapters, nuxtTutorialTrack } from './nuxt'
import { vueTutorialChapters, vueTutorialTrack } from './vue'

export const tutorialTracks: Record<TutorialFramework, TutorialTrackDefinition> = {
  vue: vueTutorialTrack,
  nuxt: nuxtTutorialTrack,
}

export const tutorialChapterDefinitionsByFramework: Record<TutorialFramework, TutorialChapterDefinition[]> = {
  vue: vueTutorialChapters,
  nuxt: nuxtTutorialChapters,
}

export const tutorialChapterDefinitions: TutorialChapterDefinition[] = [
  ...vueTutorialChapters,
  ...nuxtTutorialChapters,
]

export const tutorialChapterFolders: Record<TutorialChapterDefinition['id'], string> = Object.fromEntries(
  tutorialChapterDefinitions.map(chapter => [
    chapter.id,
    chapter.folder ?? `${chapter.framework}/${String(getChapterIndex(chapter) + 1).padStart(2, '0')}-${chapter.slug}`,
  ]),
) as Record<TutorialChapterDefinition['id'], string>

export const tutorialChapterFoldersByFramework: Record<TutorialFramework, Record<string, string>> = {
  vue: createFrameworkFolders('vue'),
  nuxt: createFrameworkFolders('nuxt'),
}

export const tutorialStepDefinitions = tutorialChapterDefinitions
export const tutorialStepFolders = tutorialChapterFolders

export function getTutorialChapterDefinitions(framework: TutorialFramework) {
  return tutorialChapterDefinitionsByFramework[framework]
}

function getChapterIndex(chapter: TutorialChapterDefinition) {
  return tutorialChapterDefinitionsByFramework[chapter.framework].findIndex(entry => entry.id === chapter.id)
}

function createFrameworkFolders(framework: TutorialFramework) {
  return Object.fromEntries(
    tutorialChapterDefinitionsByFramework[framework].map(chapter => [chapter.id, tutorialChapterFolders[chapter.id]]),
  )
}
