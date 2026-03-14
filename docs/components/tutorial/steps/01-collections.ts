import type { TutorialStepDefinition } from '../utils/types'
import * as shared from './shared'

export const collectionsStep: TutorialStepDefinition = {
  id: 'collections',
  title: 'Collections',
  feature: 'Define a collection with in-memory hooks',
  group: 'Core',
  referenceLinks: [
    { label: 'Collection', href: '/guide/schema/collection' },
    { label: 'Getting Started', href: '/guide/getting-started' },
  ],
  editableFiles: ['src/rstore/schema.ts'],
  validator: (state) => {
    const storeResult = shared.requireStore('src/rstore/schema.ts', state)
    if (storeResult)
      return storeResult

    const listResult = shared.requireList(state, 'src/rstore/schema.ts')
    if (listResult)
      return listResult

    return shared.pass('The collection now exposes the in-memory todos.', [
      'The preview resolved the three seeded todos through the collection hook.',
    ])
  },
}
