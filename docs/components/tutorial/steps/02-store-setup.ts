import type { TutorialStepDefinition } from '../utils/types'
import * as shared from './shared'

export const storeSetupStep: TutorialStepDefinition = {
  id: 'store-setup',
  title: 'Store Setup',
  feature: 'Create the store and install the Vue plugin',
  group: 'Core',
  referenceLinks: [
    { label: 'Getting Started', href: '/guide/getting-started' },
    { label: 'Plugin Setup', href: '/guide/plugin/setup' },
  ],
  editableFiles: ['src/rstore/index.ts'],
  validator: (state) => {
    const storeResult = shared.requireStore('src/rstore/index.ts', state)
    if (storeResult)
      return storeResult

    const listResult = shared.requireList(state, 'src/rstore/index.ts')
    if (listResult)
      return listResult

    return shared.pass('The store is installed and the preview can call `useStore()`.', [
      'The list rendered after the Vue app mounted with `RstorePlugin`.',
    ])
  },
}
