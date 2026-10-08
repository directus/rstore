import type { App } from 'vue'
import { createStore } from '@rstore/vue'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { createFakeRemote } from '../../utils/store/fakeRemote'

/** Distinct collections expose accidental cross-consumer refresh or cleanup. */
type CollectionName = 'todos' | 'notes'
/** Reactive public refresh option belongs to the first consumer. */
const mode = ref<'windowFocus' | 'manual'>('windowFocus')
/** Only the simulated remote service is substituted. */
const remote = createFakeRemote()
/** Mounted Vue consumers own separate native component scopes. */
const apps = new Map<CollectionName, App>()
/** Public query projections remain readable after unmount. */
const queries = new Map<CollectionName, () => { loading: boolean, error: string | null }>()
/** Public cache reads expose the final state of removed consumers. */
let cacheRows: (collection: CollectionName) => unknown = () => []
/** Cache background resources outlive individual consumer unmount. */
let disposeCache: () => void = () => {}

/** Replace both remote collections, preserving two distinct rows in each. */
export function seed(version: string): void {
  remote.seed('todos', [{ id: 't1', title: `${version} todo 1` }, { id: 't2', title: `${version} todo 2` }])
  remote.seed('notes', [{ id: 'n1', body: `${version} note 1` }, { id: 'n2', body: `${version} note 2` }])
}

/** Mount independent real components sharing one real store and focus publisher. */
export async function mount(): Promise<void> {
  seed('initial')
  const store = await createStore({
    schema: [{ name: 'todos' }, { name: 'notes' }],
    plugins: [remote.plugin],
    syncImmediately: false,
  })
  cacheRows = collection => store[collection].peekMany().map(row => ({
    id: row.id,
    text: collection === 'todos' ? row.title : row.body,
  }))
  disposeCache = () => store.$cache.dispose()
  const pending: PromiseLike<unknown>[] = []
  for (const collection of ['todos', 'notes'] as const) {
    const target = document.createElement('div')
    target.id = collection
    document.querySelector('#app')!.append(target)
    const app = createApp(defineComponent({
      setup() {
        const query = store[collection].query(q => q.many({
          fetchOptions: { autoRefresh: collection === 'todos' ? mode.value : 'windowFocus' },
        }))
        pending.push(query)
        queries.set(collection, () => ({ loading: query.loading.value, error: query.error.value?.message ?? null }))
        return () => h('ul', { 'data-testid': collection }, query.data.value.map(row => h('li', {
          key: row.id,
        }, collection === 'todos' ? row.title : row.body)))
      },
    }))
    apps.set(collection, app)
    app.mount(target)
  }
  await Promise.all(pending)
}

/** Switch supported query options while its actual component remains mounted. */
export async function setMode(value: 'windowFocus' | 'manual'): Promise<void> {
  mode.value = value
  await nextTick()
}

/** Read request evidence and exact public cache/query outputs. */
export function state() {
  return {
    todos: { requests: remote.callCount('fetchMany', 'todos'), rows: cacheRows('todos'), ...queries.get('todos')!() },
    notes: { requests: remote.callCount('fetchMany', 'notes'), rows: cacheRows('notes'), ...queries.get('notes')!() },
  }
}

/** Remove one consumer through Vue unmount while preserving its shared store. */
export function unmount(collection: CollectionName): void {
  apps.get(collection)?.unmount()
  apps.delete(collection)
}

/** Clean every acquired consumer and the shared cache even after an assertion fails. */
export function dispose(): void {
  for (const collection of apps.keys()) {
    unmount(collection)
  }
  disposeCache()
}
