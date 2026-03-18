import type { TutorialStepDefinition } from '../utils/types'
import * as shared from './shared'

export const relationsStep: TutorialStepDefinition = {
  id: 'relations',
  title: 'Relations',
  feature: 'Resolve related records from the normalized cache',
  group: 'Modeling',
  referenceLinks: [
    { label: 'Relations', href: '/guide/schema/relations' },
    { label: 'Collection', href: '/guide/schema/collection' },
  ],
  editableFiles: ['src/rstore/relations.ts'],
  validator: (state) => {
    const storeResult = shared.requireStore('src/rstore/relations.ts', state)
    if (storeResult)
      return storeResult

    if (!state.relations?.assigneeNames?.length) {
      return shared.fail(
        'The assignee relation is still unresolved in the preview.',
        [
          'At least one todo should render the related user name instead of the fallback text.',
          'Check the `defineRelations(...)` mapping in `src/rstore/relations.ts`.',
        ],
        ['src/rstore/relations.ts'],
      )
    }

    return shared.pass('The relation mapping resolves assignees from the normalized cache.', [
      'The preview is now reading `todo.assignee?.name` successfully.',
    ])
  },
}
