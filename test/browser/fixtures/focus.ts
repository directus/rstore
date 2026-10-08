import type { App } from 'vue'
import { createStore } from '@rstore/vue'
import { createApp, defineComponent, h } from 'vue'
import { createFakeRemote } from '../../utils/store/fakeRemote'

/** Browser-safe remote boundary; Vue store, cache, component and window stay real. */
const remote = createFakeRemote({ data: { messages: [{ id: 'foo', text: 'initial' }, { id: 'bar', text: 'initial without focus refresh' }] } })
/** Public projections remain readable after component disposal. */
let queryError: () => string | null = () => null
/** Cache reads observe fetched data independently of the mounted DOM. */
let cachedText: () => unknown = () => null
/** A query without focus opt-in must retain its original data. */
let disabledCachedText: () => unknown = () => null
/** Release the store's own background timers after component teardown. */
let disposeCache: () => void = () => {}
/** Mounted application owns query effects through the actual Vue lifecycle. */
let app: App | undefined

/** Create a real store and mount its reactive query consumer. */
export async function mount(): Promise<void> {
  const store = await createStore({
    schema: [{ name: 'messages' }],
    plugins: [remote.plugin],
    syncImmediately: false,
  })
  cachedText = () => store.messages.peekFirst('foo')?.text
  disabledCachedText = () => store.messages.peekFirst('bar')?.text
  disposeCache = () => store.$cache.dispose()
  app = createApp(defineComponent({
    setup() {
      const query = store.messages.query(q => q.first({
        key: 'foo',
        fetchOptions: { autoRefresh: 'windowFocus' },
      }))
      const passive = store.messages.query(q => q.first('bar'))
      queryError = () => query.error.value?.message ?? passive.error.value?.message ?? null
      return () => h('section', [
        h('p', { 'data-testid': 'message' }, query.data.value?.text ?? 'loading'),
        h('p', { 'data-testid': 'passive-message' }, passive.data.value?.text ?? 'loading'),
      ])
    },
  }))
  app.mount('#app')
}

/** Change remote data without pushing an update into the local cache. */
export function seed(text: string): void {
  remote.seed('messages', [{ id: 'foo', text }, { id: 'bar', text: `${text} without focus refresh` }])
}

/** Read public request evidence, cache data and browser focus without internal spies. */
export function state() {
  return {
    error: queryError(),
    requests: remote.callCount('fetchFirst'),
    cached: cachedText(),
    passiveCached: disabledCachedText(),
    passiveRequests: remote.requests('fetchFirst').filter(call => call.key === 'bar').length,
    focused: document.hasFocus(),
  }
}

/** Unmount so subsequent focus cannot refresh the disposed query. */
export function unmount(): void {
  app?.unmount()
  app = undefined
}

/** Release component scope and cache resources, including failed assertions. */
export function dispose(): void {
  unmount()
  disposeCache()
}
