import type { TutorialStep } from './types'
import { tutorialStepDefinitions, tutorialStepFolders } from '../steps/registry'
import { getStepSolutionFiles, getStepStarterFiles } from './tutorialAssets'
import { getStepGuideComponent } from './tutorialGuides'

export const tutorialSteps: TutorialStep[] = tutorialStepDefinitions.map(step => ({
  ...step,
  folder: tutorialStepFolders[step.id],
  starterFiles: getStepStarterFiles(step.id),
  solutionFiles: getStepSolutionFiles(step.id),
  guideComponent: getStepGuideComponent(step.id),
}))
