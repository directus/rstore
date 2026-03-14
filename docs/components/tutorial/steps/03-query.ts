import type { TutorialStepDefinition } from '../utils/types'
import * as shared from './shared'

export const queryStep: TutorialStepDefinition = {
  id: 'query',
  title: 'Query',
  feature: 'Use `query(q => q.many())` inside a component',
  group: 'Core',
  referenceLinks: [
    { label: 'Query', href: '/guide/data/query' },
    { label: 'Getting Started', href: '/guide/getting-started' },
  ],
  editableFiles: ['src/App.vue'],
  validator: (state) => {
    const storeResult = shared.requireStore('src/App.vue', state)
    if (storeResult)
      return storeResult

    const listResult = shared.requireList(state, 'src/App.vue')
    if (listResult)
      return listResult

    return shared.pass('The query is driving the list from rstore.', [
      'The preview is rendering the seeded todos from `store.Todo.query(...)`.',
    ])
  },
}
