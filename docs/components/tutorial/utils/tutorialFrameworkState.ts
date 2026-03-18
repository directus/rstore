import type { TutorialFramework } from './types'
import { tutorialTracks } from '../steps/registry'

export const tutorialFrameworks = Object.values(tutorialTracks).map(track => track.framework) as TutorialFramework[]
export const defaultTutorialFramework = tutorialFrameworks[0]!

export function createTutorialFrameworkRecord<Value>(createValue: (framework: TutorialFramework) => Value) {
  return Object.fromEntries(
    tutorialFrameworks.map(framework => [framework, createValue(framework)]),
  ) as Record<TutorialFramework, Value>
}

export function resolveTutorialFramework(framework: string | null | undefined): TutorialFramework {
  return tutorialFrameworks.includes(framework as TutorialFramework)
    ? framework as TutorialFramework
    : defaultTutorialFramework
}
