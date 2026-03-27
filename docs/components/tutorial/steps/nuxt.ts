import type { TutorialChapterDefinition, TutorialTrackDefinition } from '../utils/types'
import * as shared from './shared'

function createReadOnlyChapter(
  chapter: Omit<TutorialChapterDefinition, 'editableFiles' | 'validator'>,
  readySummary: string,
  readyDetails: string[],
): TutorialChapterDefinition {
  return {
    ...chapter,
    editableFiles: [],
    validator: (state) => {
      const bootResult = shared.requireBooted(state, 'The Nuxt sandbox has not finished booting yet.')
      if (bootResult)
        return bootResult

      return shared.pass(readySummary, readyDetails)
    },
  }
}

export const nuxtTutorialTrack: TutorialTrackDefinition = {
  framework: 'nuxt',
  label: 'Nuxt',
  description: 'Learn the Nuxt module workflow while following the same concepts used across the rest of the docs.',
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
    feature: 'Meet the Nuxt track, the filesystem conventions it uses, and the local-first data model underneath them.',
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
    feature: 'Enable `@rstore/nuxt` so Nuxt can discover collections, create the store, and expose typed helpers for you.',
    group: 'Foundations',
    referenceLinks: [
      { label: 'Getting Started', href: '/guide/getting-started' },
      { label: 'Plugin Setup', href: '/guide/plugin/setup' },
      { label: 'Collection', href: '/guide/schema/collection' },
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
  createReadOnlyChapter(
    {
      id: 'nuxt-server-api-routes',
      framework: 'nuxt',
      slug: 'server-api-routes',
      folder: 'nuxt/03-server-api-routes',
      title: 'Server API Routes',
      feature: 'Understand the tiny in-memory backend that the tutorial collections and plugins talk to.',
      group: 'Foundations',
      referenceLinks: [
        { label: 'Getting Started', href: '/guide/getting-started' },
        { label: 'Plugin Hooks', href: '/guide/plugin/hooks' },
      ],
    },
    'The server API routes chapter is ready.',
    [
      'This chapter makes the tutorial backend explicit so the rest of the Nuxt track feels grounded in a real app shape.',
    ],
  ),
  createReadOnlyChapter(
    {
      id: 'nuxt-runtime-model',
      framework: 'nuxt',
      slug: 'runtime-model',
      folder: 'nuxt/04-runtime-model',
      title: 'Nuxt Runtime Model',
      feature: 'See how `app/rstore`, auto-imports, SSR payload integration, and Nuxt DevTools fit together once the module is enabled.',
      group: 'Foundations',
      referenceLinks: [
        { label: 'Getting Started', href: '/guide/getting-started' },
        { label: 'Plugin Setup', href: '/guide/plugin/setup' },
        { label: 'Devtools', href: '/guide/devtools' },
      ],
    },
    'The Nuxt runtime model chapter is ready.',
    [
      'Use this chapter to connect the tutorial conventions to the broader Nuxt integration story in the guide.',
    ],
  ),
  createReadOnlyChapter(
    {
      id: 'nuxt-query-patterns',
      framework: 'nuxt',
      slug: 'query-patterns',
      folder: 'nuxt/05-query-patterns',
      title: 'Query Patterns',
      feature: 'Place the simple page query inside the wider query API: `first`, `many`, `find`, `peek`, `include`, pagination, and fetch policy.',
      group: 'Reading Data',
      referenceLinks: [
        { label: 'Querying Data', href: '/guide/data/query' },
        { label: 'Relations', href: '/guide/schema/relations' },
        { label: 'Cache', href: '/guide/data/cache' },
      ],
    },
    'The query patterns chapter is ready.',
    [
      'This chapter is the bridge between the first page query and the full guide coverage of reading data.',
    ],
  ),
  {
    id: 'nuxt-query-page',
    framework: 'nuxt',
    slug: 'query-page',
    folder: 'nuxt/06-query-page',
    title: 'Query in a Page',
    feature: 'Use `useStore()` and `query(q => q.many())` in a Nuxt page so the page reads directly from the store.',
    group: 'Reading Data',
    referenceLinks: [
      { label: 'Querying Data', href: '/guide/data/query' },
      { label: 'Getting Started', href: '/guide/getting-started' },
      { label: 'Cache', href: '/guide/data/cache' },
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
    feature: 'Finish the page with create, update, and delete handlers that all reuse the same query-backed state.',
    group: 'Writing Data',
    referenceLinks: [
      { label: 'Mutation', href: '/guide/data/mutation' },
      { label: 'Querying Data', href: '/guide/data/query' },
      { label: 'Cache', href: '/guide/data/cache' },
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
  createReadOnlyChapter(
    {
      id: 'nuxt-mutation-patterns',
      framework: 'nuxt',
      slug: 'mutation-patterns',
      folder: 'nuxt/08-mutation-patterns',
      title: 'Mutation Patterns',
      feature: 'Connect the page-level CRUD flow to bulk mutations, optimistic updates, and cache-layer behavior.',
      group: 'Writing Data',
      referenceLinks: [
        { label: 'Mutation', href: '/guide/data/mutation' },
        { label: 'Cache', href: '/guide/data/cache' },
        { label: 'Plugin Hooks', href: '/guide/plugin/hooks' },
      ],
    },
    'The mutation patterns chapter is ready.',
    [
      'This chapter gives the page exercise the same wider context the mutation guide covers.',
    ],
  ),
  {
    id: 'nuxt-move-transport-plugin',
    framework: 'nuxt',
    slug: 'move-transport-plugin',
    folder: 'nuxt/09-move-transport-plugin',
    title: 'Move Transport into `app/rstore/plugins`',
    feature: 'Keep collection files focused on model shape and move backend transport policy into an rstore plugin.',
    group: 'Modeling',
    referenceLinks: [
      { label: 'Plugin Setup', href: '/guide/plugin/setup' },
      { label: 'Plugin Hooks', href: '/guide/plugin/hooks' },
      { label: 'Federation', href: '/guide/schema/federation' },
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
    feature: 'Manage create and update flows with rstore form helpers instead of rebuilding form state in the component.',
    group: 'Writing Data',
    referenceLinks: [
      { label: 'Form Object', href: '/guide/data/form' },
      { label: 'Mutation', href: '/guide/data/mutation' },
      { label: 'Relations', href: '/guide/schema/relations' },
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
    feature: 'Define relation mappings so the page can resolve related users from the same normalized cache.',
    group: 'Modeling',
    referenceLinks: [
      { label: 'Relations', href: '/guide/schema/relations' },
      { label: 'Collection', href: '/guide/schema/collection' },
      { label: 'Form Object', href: '/guide/data/form' },
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
    feature: 'Keep the Nuxt page in sync with remote-style updates by combining `liveQuery()` and subscription hooks.',
    group: 'Reactivity',
    referenceLinks: [
      { label: 'Subscriptions', href: '/guide/data/live' },
      { label: 'Plugin Hooks', href: '/guide/plugin/hooks' },
      { label: 'Cache', href: '/guide/data/cache' },
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
    feature: 'Use direct cache reads and writes when you need to work against the same normalized state the page queries rely on.',
    group: 'Reactivity',
    referenceLinks: [
      { label: 'Cache', href: '/guide/data/cache' },
      { label: 'Querying Data', href: '/guide/data/query' },
      { label: 'Mutation', href: '/guide/data/mutation' },
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
  {
    id: 'nuxt-advanced-workflows',
    framework: 'nuxt',
    slug: 'advanced-workflows',
    folder: 'nuxt/14-advanced-workflows',
    playgroundSourceChapterId: 'nuxt-cache-apis',
    title: 'Learn Next',
    feature: 'Start from the completed tutorial app, explore the unlocked source code, and branch into offline sync, federation, devtools, Drizzle integration, and collaboration.',
    group: 'Beyond the Basics',
    referenceLinks: [
      { label: 'Offline', href: '/guide/data/offline' },
      { label: 'Devtools', href: '/guide/devtools' },
      { label: 'Federation', href: '/guide/schema/federation' },
      { label: 'Nuxt + Drizzle', href: '/plugins/nuxt-drizzle' },
      { label: 'Yjs', href: '/plugins/yjs' },
    ],
    editableFiles: [],
    validator: (state) => {
      const bootResult = shared.requireBooted(state, 'The Nuxt sandbox has not finished booting yet.')
      if (bootResult)
        return bootResult

      return shared.pass('The completed Nuxt tutorial app is unlocked.', [
        'Use this last chapter as a sandbox: every app file in the editor starts from the finished exercise so you can explore and remix it freely.',
      ])
    },
  },
]
