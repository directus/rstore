import type { TutorialStepDefinition } from '../utils/types'
import * as shared from './shared'

export const pluginSetupStep: TutorialStepDefinition = {
  id: 'plugin-setup',
  title: 'Plugin Setup',
  feature: 'Move transport logic into an rstore plugin',
  group: 'Modeling',
  referenceLinks: [
    { label: 'Plugin Setup', href: '/guide/plugin/setup' },
    { label: 'Plugin Hooks', href: '/guide/plugin/hooks' },
    { label: 'Collection', href: '/guide/schema/collection' },
  ],
  editableFiles: ['src/rstore/schema.ts', 'src/rstore/memoryPlugin.ts'],
  validator: (state) => {
    const storeResult = shared.requireStore('src/rstore/memoryPlugin.ts', state)
    if (storeResult)
      return storeResult

    if (state.transportMode !== 'plugin') {
      return shared.fail(
        'The preview is not reporting plugin-based transport yet.',
        [
          'The solution should expose `transportMode: "plugin"` from the memory plugin init hook.',
          'Queries should still resolve the three seeded todos through the plugin hooks.',
        ],
        ['src/rstore/memoryPlugin.ts', 'src/rstore/schema.ts'],
      )
    }

    const listResult = shared.requireList(state, 'src/rstore/memoryPlugin.ts')
    if (listResult)
      return listResult

    return shared.pass('The transport layer now lives in a reusable plugin.', [
      'The preview fetched the seeded list through plugin hooks instead of collection-local hooks.',
    ])
  },
}
