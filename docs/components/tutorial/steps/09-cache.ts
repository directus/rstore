import type { TutorialStepDefinition } from '../utils/types'
import * as shared from './shared'

export const cacheStep: TutorialStepDefinition = {
  id: 'cache',
  title: 'Cache',
  feature: 'Interact with `peekMany()`, `writeItem()`, and `$cache.clear()`',
  group: 'Reactivity',
  referenceLinks: [
    { label: 'Cache', href: '/guide/data/cache' },
    { label: 'Query', href: '/guide/data/query' },
    { label: 'Subscriptions', href: '/guide/data/live' },
  ],
  editableFiles: ['src/components/CachePanel.vue'],
  validationAction: 'cache-smoke',
  validator: (state) => {
    const storeResult = shared.requireStore('src/components/CachePanel.vue', state)
    if (storeResult)
      return storeResult

    if (!state.cache?.injected || !state.cache.cleared) {
      return shared.fail(
        'The cache smoke test did not write and clear data through the cache API.',
        [
          'The solution should inject one todo with `writeItem()` and then clear the store with `$cache.clear()`.',
          'The rendered query should react immediately to both operations.',
        ],
        ['src/components/CachePanel.vue'],
      )
    }

    return shared.pass('The cache controls are updating the preview directly through rstore cache APIs.', [
      'The automated smoke test injected cache data and then cleared it again.',
    ])
  },
}
