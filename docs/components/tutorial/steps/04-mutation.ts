import type { TutorialStepDefinition } from '../utils/types'
import * as shared from './shared'

export const mutationStep: TutorialStepDefinition = {
  id: 'mutation',
  title: 'Mutation',
  feature: 'Create, update, and delete through the collection API',
  group: 'Core',
  referenceLinks: [
    { label: 'Mutation', href: '/guide/data/mutation' },
    { label: 'Query', href: '/guide/data/query' },
  ],
  editableFiles: ['src/components/TutorialContent.vue'],
  validationAction: 'mutation-smoke',
  validator: (state) => {
    const storeResult = shared.requireStore('src/components/TutorialContent.vue', state)
    if (storeResult)
      return storeResult

    if (!state.mutation?.created || !state.mutation.toggled || !state.mutation.deleted) {
      return shared.fail(
        'The mutation smoke test did not complete all three operations.',
        [
          'The preview should be able to create a new todo, toggle it, and then delete it again.',
          'Check the add, toggle, and delete handlers in `TutorialContent.vue`.',
        ],
        ['src/components/TutorialContent.vue'],
      )
    }

    return shared.pass('The mutation handlers update the normalized cache correctly.', [
      'The automated smoke test created, toggled, and deleted a todo in the preview.',
    ])
  },
}
