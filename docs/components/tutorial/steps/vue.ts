import type { TutorialChapterDefinition, TutorialTrackDefinition } from '../utils/types'
import * as shared from './shared'

export const vueTutorialTrack: TutorialTrackDefinition = {
  framework: 'vue',
  label: 'Vue',
  description: 'Build an rstore-powered Vue app inside the interactive sandbox.',
  imageSrc: '/vue.svg',
  runtimePort: 4173,
}

export const vueTutorialChapters: TutorialChapterDefinition[] = [
  {
    id: 'vue-welcome',
    framework: 'vue',
    slug: 'welcome',
    folder: 'vue/01-welcome',
    title: 'Welcome',
    feature: 'Meet the tutorial, the sandbox, and the local-first rstore mental model.',
    group: 'Foundations',
    referenceLinks: [
      { label: 'About rstore', href: '/guide/learn-more' },
      { label: 'Getting Started', href: '/guide/getting-started' },
    ],
    editableFiles: [],
    validator: (state) => {
      const bootResult = shared.requireBooted(state, 'The preview has not finished booting yet.')
      if (bootResult)
        return bootResult

      return shared.pass('The tutorial sandbox is ready.', [
        'You can move to the next chapter whenever you are ready to start editing code.',
      ])
    },
  },
  {
    id: 'vue-define-collections',
    framework: 'vue',
    slug: 'define-collections',
    folder: 'vue/02-define-collections',
    title: 'Define Collections',
    feature: 'Define the typed collections and connect them to the tutorial backend.',
    group: 'Foundations',
    referenceLinks: [
      { label: 'Collection', href: '/guide/schema/collection' },
      { label: 'Getting Started', href: '/guide/getting-started' },
    ],
    editableFiles: ['src/rstore/schema.ts'],
    validationAction: 'query-smoke',
    validator: (state) => {
      const storeResult = shared.requireStore('src/rstore/schema.ts', state)
      if (storeResult)
        return storeResult

      const listResult = shared.requireList(state, 'src/rstore/schema.ts')
      if (listResult)
        return listResult

      return shared.pass('The schema now exposes the collections the app needs.', [
        'The Vue app can resolve seeded todos through the typed collection definitions.',
      ])
    },
  },
  {
    id: 'vue-create-install-store',
    framework: 'vue',
    slug: 'create-install-store',
    folder: 'vue/04-create-install-store',
    title: 'Create and Install the Store',
    feature: 'Build the store instance and register the Vue plugin.',
    group: 'Foundations',
    referenceLinks: [
      { label: 'Getting Started', href: '/guide/getting-started' },
      { label: 'Plugin Setup', href: '/guide/plugin/setup' },
    ],
    editableFiles: ['src/rstore/index.ts'],
    validationAction: 'query-smoke',
    validator: (state) => {
      const storeResult = shared.requireStore('src/rstore/index.ts', state)
      if (storeResult)
        return storeResult

      const listResult = shared.requireList(state, 'src/rstore/index.ts')
      if (listResult)
        return listResult

      return shared.pass('The store is installed in the Vue app.', [
        'Components can now access the typed store through `useStore()`.',
      ])
    },
  },
  {
    id: 'vue-query-list',
    framework: 'vue',
    slug: 'query-list',
    folder: 'vue/05-query-list',
    title: 'Query a List',
    feature: 'Use one reactive query for the list, loading state, and refresh flow.',
    group: 'Reading Data',
    referenceLinks: [
      { label: 'Querying Data', href: '/guide/data/query' },
      { label: 'Getting Started', href: '/guide/getting-started' },
    ],
    editableFiles: ['src/App.vue'],
    validationAction: 'query-refresh-smoke',
    validator: (state) => {
      const storeResult = shared.requireStore('src/App.vue', state)
      if (storeResult)
        return storeResult

      const listResult = shared.requireList(state, 'src/App.vue')
      if (listResult)
        return listResult

      if (!state.query?.refreshWorked) {
        return shared.fail(
          'The page still needs to wire the query refresh workflow.',
          [
            'Make sure the component keeps the real query `refresh()` function and exposes its loading state in the template.',
            'The list should still come from `store.Todo.query(...)` instead of local placeholder refs.',
          ],
          ['src/App.vue'],
        )
      }

      return shared.pass('The page is driven by one cache-backed query.', [
        'The component renders todos, shows loading, and refreshes through the same rstore query result.',
      ])
    },
  },
  {
    id: 'vue-create-todos',
    framework: 'vue',
    slug: 'create-todos',
    folder: 'vue/07-create-todos',
    title: 'Create Todos',
    feature: 'Finish the everyday CRUD loop with create, toggle, and delete handlers.',
    group: 'Writing Data',
    referenceLinks: [
      { label: 'Mutation', href: '/guide/data/mutation' },
      { label: 'Querying Data', href: '/guide/data/query' },
    ],
    editableFiles: ['src/App.vue'],
    validationAction: 'mutation-smoke',
    validator: (state) => {
      const storeResult = shared.requireStore('src/App.vue', state)
      if (storeResult)
        return storeResult

      if (!state.mutation?.created || !state.mutation.toggled || !state.mutation.deleted) {
        return shared.fail(
          'The page still needs the full create, toggle, and delete flow.',
          [
            'Create a new todo through `store.Todo.create(...)`, then keep the list reactive by toggling with `$update(...)` and removing with `store.Todo.delete(...)`.',
            'The same query-driven list should update after all three actions without manual array bookkeeping.',
          ],
          ['src/App.vue'],
        )
      }

      return shared.pass('The page can complete the full CRUD loop through rstore.', [
        'Creating, toggling, and deleting todos all flow through the collection API and stay in sync with the normalized cache.',
      ])
    },
  },
  {
    id: 'vue-form-objects',
    framework: 'vue',
    slug: 'form-objects',
    folder: 'vue/09-form-objects',
    title: 'Form Objects',
    feature: 'Manage create and update flows with `createForm()` and `updateForm()`.',
    group: 'Writing Data',
    referenceLinks: [
      { label: 'Form Object', href: '/guide/data/form' },
      { label: 'Mutation', href: '/guide/data/mutation' },
    ],
    editableFiles: ['src/components/TodoForm.vue'],
    validationAction: 'form-smoke',
    validator: (state) => {
      const storeResult = shared.requireStore('src/components/TodoForm.vue', state)
      if (storeResult)
        return storeResult

      if (!state.form?.ready || !state.form.created || !state.form.updated || !state.form.resetWorked) {
        return shared.fail(
          'The form object workflow is still missing one of the expected interactions.',
          [
            'The create form should submit a todo.',
            'The update form should detect changes, reset back to the loaded values, and then save an update.',
          ],
          ['src/components/TodoForm.vue'],
        )
      }

      return shared.pass('The form component is powered by rstore form objects.', [
        'Create, reset, and update flows now live on the collection form helpers instead of local refs.',
      ])
    },
  },
  {
    id: 'vue-relations',
    framework: 'vue',
    slug: 'relations',
    folder: 'vue/10-relations',
    title: 'Relations',
    feature: 'Resolve assignees from the normalized cache with a typed relation.',
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
            'Define the relation so a todo can resolve its user record from the normalized cache.',
            'At least one todo should show a real assignee name instead of the fallback text.',
          ],
          ['src/rstore/relations.ts'],
        )
      }

      return shared.pass('The relation mapping can resolve related users.', [
        'The list is reading `todo.assignee?.name` from cached User records.',
      ])
    },
  },
  {
    id: 'vue-extract-plugin',
    framework: 'vue',
    slug: 'extract-plugin',
    folder: 'vue/11-extract-plugin',
    title: 'Extract a Plugin',
    feature: 'Move repeated transport logic into a reusable rstore plugin.',
    group: 'Modeling',
    referenceLinks: [
      { label: 'Plugin Setup', href: '/guide/plugin/setup' },
      { label: 'Plugin Hooks', href: '/guide/plugin/hooks' },
    ],
    editableFiles: ['src/rstore/schema.ts', 'src/rstore/memoryPlugin.ts'],
    validationAction: 'query-smoke',
    validator: (state) => {
      const storeResult = shared.requireStore('src/rstore/memoryPlugin.ts', state)
      if (storeResult)
        return storeResult

      const listResult = shared.requireList(state, 'src/rstore/memoryPlugin.ts')
      if (listResult)
        return listResult

      return shared.pass('The collection transport now lives in a reusable plugin.', [
        'The schema stays focused on data shape while the plugin handles fetching and mutations.',
      ])
    },
  },
  {
    id: 'vue-live-query',
    framework: 'vue',
    slug: 'live-query',
    folder: 'vue/12-live-query',
    title: 'Live Query',
    feature: 'Combine `liveQuery()` with plugin subscriptions for remote updates.',
    group: 'Reactivity',
    referenceLinks: [
      { label: 'Subscriptions', href: '/guide/data/live' },
      { label: 'Plugin Hooks', href: '/guide/plugin/hooks' },
    ],
    editableFiles: ['src/rstore/memoryPlugin.ts', 'src/App.vue'],
    validationAction: 'live-smoke',
    validator: (state) => {
      const storeResult = shared.requireStore('src/App.vue', state)
      if (storeResult)
        return storeResult

      if (!state.live?.remoteInsertSeen) {
        return shared.fail(
          'The simulated remote insert never reached the live query.',
          [
            'Swap the list to `liveQuery()` and connect the plugin subscription hooks.',
            'Incoming remote items should write into the cache so the list updates automatically.',
          ],
          ['src/App.vue', 'src/rstore/memoryPlugin.ts'],
        )
      }

      return shared.pass('Remote inserts flow through the live query.', [
        'The preview updates automatically when the tutorial simulates a remote todo.',
      ])
    },
  },
  {
    id: 'vue-cache-apis',
    framework: 'vue',
    slug: 'cache-apis',
    folder: 'vue/13-cache-apis',
    title: 'Cache APIs',
    feature: 'Read and write directly against the normalized cache when you need to.',
    group: 'Reactivity',
    referenceLinks: [
      { label: 'Cache', href: '/guide/data/cache' },
      { label: 'Querying Data', href: '/guide/data/query' },
    ],
    editableFiles: ['src/components/CachePanel.vue'],
    validationAction: 'cache-smoke',
    validator: (state) => {
      const storeResult = shared.requireStore('src/components/CachePanel.vue', state)
      if (storeResult)
        return storeResult

      if (!state.cache?.injected || !state.cache.cleared) {
        return shared.fail(
          'The cache controls did not inject and clear data through the cache APIs.',
          [
            'Write one todo with `writeItem()` and clear the store with `$cache.clear()`.',
            'The page should react immediately because the query is reading from the normalized cache.',
          ],
          ['src/components/CachePanel.vue'],
        )
      }

      return shared.pass('The cache controls are updating the store directly.', [
        'This chapter demonstrates synchronous cache reads, local writes, and full resets.',
      ])
    },
  },
]
