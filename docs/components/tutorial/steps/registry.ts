import type { TutorialStepDefinition } from '../utils/types'
import { collectionsStep } from './01-collections'
import { storeSetupStep } from './02-store-setup'
import { queryStep } from './03-query'
import { mutationStep } from './04-mutation'
import { formsStep } from './05-forms'
import { relationsStep } from './06-relations'
import { pluginSetupStep } from './07-plugin-setup'
import { liveQueryStep } from './08-live-query'
import { cacheStep } from './09-cache'

export const tutorialStepDefinitions: TutorialStepDefinition[] = [
  collectionsStep,
  storeSetupStep,
  queryStep,
  mutationStep,
  formsStep,
  relationsStep,
  pluginSetupStep,
  liveQueryStep,
  cacheStep,
]

export const tutorialStepFolders: Record<TutorialStepDefinition['id'], string> = {
  'collections': '01-collections',
  'store-setup': '02-store-setup',
  'query': '03-query',
  'mutation': '04-mutation',
  'forms': '05-forms',
  'relations': '06-relations',
  'plugin-setup': '07-plugin-setup',
  'live-query': '08-live-query',
  'cache': '09-cache',
}
