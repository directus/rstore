import type { TutorialChapterDefinition, TutorialTrackDefinition } from '../utils/types'
import * as shared from './shared'

export const nuxtTutorialTrack: TutorialTrackDefinition = {
  framework: 'nuxt',
  label: 'Nuxt',
  description: 'Learn the Nuxt module workflow with a real Nuxt sandbox.',
  imageSrc: '/nuxt.svg',
  runtimePort: 3000,
}

export const nuxtTutorialChapters: TutorialChapterDefinition[] = [
  {
    id: 'nuxt-welcome',
    framework: 'nuxt',
    slug: 'welcome',
    folder: 'nuxt/01-welcome',
    title: 'Welcome',
    feature: 'Meet the Nuxt tutorial track and how rstore fits into filesystem-driven apps.',
    group: 'Foundations',
    referenceLinks: [
      { label: 'About rstore', href: '/guide/learn-more' },
      { label: 'Getting Started', href: '/guide/getting-started' },
    ],
    editableFiles: [],
    validator: (state) => {
      const bootResult = shared.requireBooted(state, 'The Nuxt sandbox has not finished booting yet.')
      if (bootResult)
        return bootResult

      return shared.pass('The Nuxt tutorial sandbox is ready.', [
        'Continue when you want to move from the overview into the Nuxt-specific workflow.',
      ])
    },
  },
  {
    id: 'nuxt-module-setup',
    framework: 'nuxt',
    slug: 'module-setup',
    folder: 'nuxt/02-module-setup',
    title: 'Module Setup',
    feature: 'Enable the Nuxt module and let it discover your Todo and User collections.',
    group: 'Foundations',
    referenceLinks: [
      { label: 'Getting Started', href: '/guide/getting-started' },
      { label: 'Plugin Setup', href: '/guide/plugin/setup' },
    ],
    editableFiles: ['nuxt.config.ts', 'app/rstore/todos.ts', 'app/rstore/users.ts'],
    validationAction: 'query-smoke',
    validator: (state) => {
      const storeResult = shared.requireStore('app/rstore/todos.ts', state, 'Nuxt never finished booting with the rstore module enabled.')
      if (storeResult)
        return storeResult

      const listResult = shared.requireList(state, 'app/rstore/todos.ts')
      if (listResult)
        return listResult

      return shared.pass('The Nuxt module is registered.', [
        'Nuxt is discovering the collections, creating the store for you, and exposing the typed `useStore()` helper to the rest of the track.',
      ])
    },
  },
  {
    id: 'nuxt-query-page',
    framework: 'nuxt',
    slug: 'query-page',
    folder: 'nuxt/06-query-page',
    title: 'Query in a Page',
    feature: 'Use `useStore()` and `query(q => q.many())` inside a Nuxt page.',
    group: 'Reading Data',
    referenceLinks: [
      { label: 'Querying Data', href: '/guide/data/query' },
      { label: 'Getting Started', href: '/guide/getting-started' },
    ],
    editableFiles: ['app/pages/index.vue'],
    validationAction: 'query-smoke',
    validator: (state) => {
      const storeResult = shared.requireStore('app/pages/index.vue', state, 'The Nuxt page cannot access the injected store yet.')
      if (storeResult)
        return storeResult

      const listResult = shared.requireList(state, 'app/pages/index.vue')
      if (listResult)
        return listResult

      return shared.pass('The Nuxt page is rendering data from an rstore query.', [
        'The page query is now reading the seeded todo list from the store.',
      ])
    },
  },
  {
    id: 'nuxt-create-todos',
    framework: 'nuxt',
    slug: 'create-todos',
    folder: 'nuxt/07-create-todos',
    title: 'Create Todos',
    feature: 'Finish the page with create, toggle, and delete handlers.',
    group: 'Writing Data',
    referenceLinks: [
      { label: 'Mutation', href: '/guide/data/mutation' },
      { label: 'Querying Data', href: '/guide/data/query' },
    ],
    editableFiles: ['app/pages/index.vue'],
    validationAction: 'mutation-smoke',
    validator: (state) => {
      const storeResult = shared.requireStore('app/pages/index.vue', state, 'The Nuxt page cannot use the store yet.')
      if (storeResult)
        return storeResult

      if (!state.mutation?.created || !state.mutation.toggled || !state.mutation.deleted) {
        return shared.fail(
          'The Nuxt page still needs the full CRUD workflow.',
          [
            'Use `store.Todo.create(...)`, item `$update(...)`, and `store.Todo.delete(...)` so the page can create, toggle, and remove todos.',
            'A successful implementation should update the query-driven list after each action without a full reload.',
          ],
          ['app/pages/index.vue'],
        )
      }

      return shared.pass('The Nuxt page can complete the whole CRUD loop through rstore.', [
        'Creating, toggling, and deleting todos all flow through the module-generated store and keep the page query in sync.',
      ])
    },
  },
  {
    id: 'nuxt-move-transport-plugin',
    framework: 'nuxt',
    slug: 'move-transport-plugin',
    folder: 'nuxt/09-move-transport-plugin',
    title: 'Move Transport into `app/rstore/plugins`',
    feature: 'Keep the collection schema focused and move transport logic into a plugin.',
    group: 'Modeling',
    referenceLinks: [
      { label: 'Plugin Setup', href: '/guide/plugin/setup' },
      { label: 'Plugin Hooks', href: '/guide/plugin/hooks' },
    ],
    editableFiles: ['app/rstore/todos.ts', 'app/rstore/plugins/memory.ts'],
    validationAction: 'query-smoke',
    validator: (state) => {
      const storeResult = shared.requireStore('app/rstore/plugins/memory.ts', state, 'Nuxt never finished loading the rstore plugin for this chapter.')
      if (storeResult)
        return storeResult

      const listResult = shared.requireList(state, 'app/rstore/plugins/memory.ts')
      if (listResult)
        return listResult

      return shared.pass('Nuxt transport logic now lives in a reusable plugin.', [
        'The collection shape stays focused on schema while the plugin handles the backend calls.',
      ])
    },
  },
  {
    id: 'nuxt-form-objects',
    framework: 'nuxt',
    slug: 'form-objects',
    folder: 'nuxt/10-form-objects',
    title: 'Form Objects',
    feature: 'Manage create and update flows with rstore form helpers in Nuxt components.',
    group: 'Writing Data',
    referenceLinks: [
      { label: 'Form Object', href: '/guide/data/form' },
      { label: 'Mutation', href: '/guide/data/mutation' },
    ],
    editableFiles: ['app/components/TodoForm.vue'],
    validationAction: 'form-smoke',
    validator: (state) => {
      const storeResult = shared.requireStore('app/components/TodoForm.vue', state, 'The Nuxt form component cannot access the store yet.')
      if (storeResult)
        return storeResult

      if (!state.form?.ready || !state.form.created || !state.form.updated || !state.form.resetWorked) {
        return shared.fail(
          'The Nuxt form workflow is still missing part of the expected behavior.',
          [
            'Use the collection form helpers for both create and update flows.',
            'The update form should reset to its loaded values before saving a change.',
          ],
          ['app/components/TodoForm.vue'],
        )
      }

      return shared.pass('The Nuxt component is powered by rstore form objects.', [
        'Create, reset, and update flows now use the collection form helpers directly.',
      ])
    },
  },
  {
    id: 'nuxt-relations',
    framework: 'nuxt',
    slug: 'relations',
    folder: 'nuxt/11-relations',
    title: 'Relations',
    feature: 'Resolve related users from the normalized cache in Nuxt.',
    group: 'Modeling',
    referenceLinks: [
      { label: 'Relations', href: '/guide/schema/relations' },
      { label: 'Collection', href: '/guide/schema/collection' },
    ],
    editableFiles: ['app/rstore/relations.ts'],
    validator: (state) => {
      const storeResult = shared.requireStore('app/rstore/relations.ts', state, 'Nuxt did not finish loading the relation mapping.')
      if (storeResult)
        return storeResult

      if (!state.relations?.assigneeNames?.length) {
        return shared.fail(
          'The Nuxt page is still missing resolved assignee names.',
          [
            'Define the relation so todo items can resolve the related user from the cache.',
            'At least one todo should show a real assignee name.',
          ],
          ['app/rstore/relations.ts'],
        )
      }

      return shared.pass('The Nuxt app can resolve related users from the cache.', [
        'The relation mapping now powers `todo.assignee?.name` in the page.',
      ])
    },
  },
  {
    id: 'nuxt-live-query',
    framework: 'nuxt',
    slug: 'live-query',
    folder: 'nuxt/12-live-query',
    title: 'Live Query',
    feature: 'Keep the Nuxt page in sync with remote-like updates through `liveQuery()`.',
    group: 'Reactivity',
    referenceLinks: [
      { label: 'Subscriptions', href: '/guide/data/live' },
      { label: 'Plugin Hooks', href: '/guide/plugin/hooks' },
    ],
    editableFiles: ['app/pages/index.vue', 'app/rstore/plugins/memory.ts'],
    validationAction: 'live-smoke',
    validator: (state) => {
      const storeResult = shared.requireStore('app/pages/index.vue', state, 'The Nuxt live query chapter is not ready yet.')
      if (storeResult)
        return storeResult

      if (!state.live?.remoteInsertSeen) {
        return shared.fail(
          'The simulated remote insert never reached the Nuxt live query.',
          [
            'Switch the page to `liveQuery()` and make the plugin write subscription events into the cache.',
            'The page should update automatically after the remote simulation runs.',
          ],
          ['app/pages/index.vue', 'app/rstore/plugins/memory.ts'],
        )
      }

      return shared.pass('The Nuxt page reacts to remote-style updates automatically.', [
        'The live query now stays in sync with subscription events pushed through the plugin.',
      ])
    },
  },
  {
    id: 'nuxt-cache-apis',
    framework: 'nuxt',
    slug: 'cache-apis',
    folder: 'nuxt/13-cache-apis',
    title: 'Cache APIs',
    feature: 'Use cache reads and writes directly inside the Nuxt app.',
    group: 'Reactivity',
    referenceLinks: [
      { label: 'Cache', href: '/guide/data/cache' },
      { label: 'Querying Data', href: '/guide/data/query' },
    ],
    editableFiles: ['app/components/CachePanel.vue'],
    validationAction: 'cache-smoke',
    validator: (state) => {
      const storeResult = shared.requireStore('app/components/CachePanel.vue', state, 'The cache demo never finished booting in Nuxt.')
      if (storeResult)
        return storeResult

      if (!state.cache?.injected || !state.cache.cleared) {
        return shared.fail(
          'The Nuxt cache controls did not inject and clear data through the cache APIs.',
          [
            'Write one todo with `writeItem()` and clear everything with `$cache.clear()`.',
            'The page should react immediately to both cache operations.',
          ],
          ['app/components/CachePanel.vue'],
        )
      }

      return shared.pass('The Nuxt cache controls are updating the store directly.', [
        'This chapter demonstrates synchronous reads and local cache writes without leaving the app.',
      ])
    },
  },
]
