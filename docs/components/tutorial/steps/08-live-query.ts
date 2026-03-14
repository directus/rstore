import type { TutorialStepDefinition } from '../utils/types'
import * as shared from './shared'

export const liveQueryStep: TutorialStepDefinition = {
  id: 'live-query',
  title: 'Live Query',
  feature: 'Combine `liveQuery()` with plugin subscriptions',
  group: 'Reactivity',
  referenceLinks: [
    { label: 'Subscriptions', href: '/guide/data/live' },
    { label: 'Plugin Hooks', href: '/guide/plugin/hooks' },
    { label: 'Query', href: '/guide/data/query' },
  ],
  editableFiles: ['src/rstore/memoryPlugin.ts', 'src/App.vue'],
  validationAction: 'live-smoke',
  validator: (state) => {
    const storeResult = shared.requireStore('src/App.vue', state)
    if (storeResult)
      return storeResult

    if (!state.live?.remoteInsertSeen) {
      return shared.fail(
        'The preview did not react to the simulated remote insert.',
        [
          'The live query should subscribe through the plugin and write the incoming todo into the cache.',
          'Check both the `liveQuery()` call and the subscription hooks.',
        ],
        ['src/App.vue', 'src/rstore/memoryPlugin.ts'],
      )
    }

    return shared.pass('Remote updates are now flowing into the live query.', [
      'The simulated remote todo appeared in the rendered list without a manual refresh.',
    ])
  },
}
