import type { BrowserPanel } from '../../../packages/devtools/src/browser/panel'
import type { Action, ReadRequest, Target, ViewName } from '../../../packages/devtools/src/protocol'
import type { RstoreDevtools } from '../../../packages/devtools/src/runtime'
import { findMany, subscribe, unsubscribe } from '../../../packages/core/src'
import { connectBrowserPanel } from '../../../packages/devtools/src/browser/panel'
import { createBrowserDevtools } from '../../../packages/devtools/src/browser/runtime'
import { createVueDevtoolsAdapter } from '../../../packages/devtools/src/vue/adapter'
import { defineModule } from '../../../packages/vue/src'
import { createFakeRemote } from '../../utils/store/fakeRemote'
import { createCoreStore } from '../../utils/store/realCacheStore'

/** Fixture owns real stores and runtime per browsing context, never window-global store handles. */
let runtime: RstoreDevtools | undefined
/** Actual public store factory resources. */
const fixtures: Awaited<ReturnType<typeof createCoreStore>>[] = []
/** Shared stateful remote fixture is reused at the permitted external-service boundary. */
const stores = new Map<string, { fixture: Awaited<ReturnType<typeof createCoreStore>>, remote: ReturnType<typeof createFakeRemote> }>()
/** Real subscription teardown, keyed by logical store identity. */
const subscriptions = new Map<string, () => Promise<void>>()
/** Inspector context owns its panel only. */
let panel: BrowserPanel | undefined
/** Detached notifications collected through actual MessagePort delivery. */
let notifications: unknown[] = []
/** Scoped module-interest release owned by this panel. */
let unwatch: (() => void) | undefined
/** Actual module state exposed through registered Vue store. */
let moduleState: { count: number } | undefined

/** Create Core and Vue producers without an HTTP relay; reusable by browser inspector scenarios. */
export async function initialize(options: { rich?: boolean, readOnly?: boolean, relay?: boolean, base?: string } = {}): Promise<Target[]> {
  await dispose()
  if (options.relay) {
    const base = options.base ?? '/__rstore/'
    const response = await fetch(new URL('bootstrap.json', new URL(base, location.href)), { cache: 'no-store' })
    if (!response.ok)
      throw new Error('Devtools bootstrap unavailable')
    const bootstrap = await response.json()
    if (new URL(bootstrap.baseURL).origin !== location.origin)
      throw new Error('Bootstrap must remain same-origin')
    runtime = createBrowserDevtools({ baseURL: bootstrap.baseURL, authToken: bootstrap.authToken })
  }
  else {
    runtime = createBrowserDevtools({ relay: false })
  }
  const registrations: Array<{ id: string, factory: 'core' | 'vue', readOnly?: boolean }> = [{ id: 'core', factory: 'core' }, { id: 'vue', factory: 'vue' }]
  if (options.readOnly)
    registrations.push({ id: 'readonly', factory: 'core', readOnly: true })
  for (const { id, factory, readOnly } of registrations) {
    const remote = createFakeRemote({ data: {
      todos: [{ id, title: `${id} row` }, ...(options.rich ? [{ id: `remote-${id}`, title: `remote ${id} row`, author_id: `author-${id}` }] : [])],
      users: [{ id: `author-${id}`, name: `${id} author` }],
    } })
    const fixture = await createCoreStore({ factory, schema: [{ name: 'todos', ...(options.rich ? { relations: { author: { to: { users: { on: { id: 'author_id' } } } } } } : {}) }, ...(options.rich ? [{ name: 'users' }] : [])], plugins: [remote.plugin], tombstoneGc: false })
    fixtures.push(fixture)
    stores.set(id, { fixture, remote })
    runtime.attachStore(fixture.store, { id, readOnly, ...(factory === 'vue' ? { adapter: createVueDevtoolsAdapter() } : {}) })
    fixture.cache.writeItem({ collection: fixture.store.$collections[0]!, key: id, item: { id, title: `${id} row` } })
    if (factory === 'vue') {
      const module = defineModule('counter', ({ defineState }) => ({ state: defineState({ count: 1 }) }))(fixture.store as any)
      moduleState = module.state
    }
    if (options.rich) {
      await findMany({ store: fixture.store, collection: fixture.store.$collections[0]!, findOptions: { fetchPolicy: 'fetch-only' } })
      await subscribeProducer(id)
      remote.failNext('fetchMany', new Error('Fixture fetch failed'))
      try {
        await findMany({ store: fixture.store, collection: fixture.store.$collections[0]!, findOptions: { fetchPolicy: 'fetch-only' } })
      }
      catch (error) {
        if (!(error instanceof Error) || error.message !== 'Fixture fetch failed')
          throw error
      }
    }
  }
  return runtime.listStores().map(store => store.target)
}

/** Observe completed connector effects independently from inspector response/UI state. */
export function backendRows(storeId: string): Array<Record<string, unknown>> {
  const owner = stores.get(storeId)
  if (!owner)
    throw new Error('Unknown producer store')
  return owner.remote.rows('todos')
}

/** Read committed cache through actual public API, preserving independence from inspector DTO. */
export function cacheRows(storeId: string): Array<Record<string, unknown>> {
  const owner = stores.get(storeId)
  if (!owner)
    throw new Error('Unknown producer store')
  return owner.fixture.cache.readItems({ collection: owner.fixture.store.$collections[0]! }).map(item => ({ ...item }))
}

/** Application cache write triggers real instrumentation rather than manually emitting an invalidation. */
export function writeProducer({ storeId, item }: { storeId: string, item: Record<string, unknown> }): void {
  const owner = stores.get(storeId)
  if (!owner)
    throw new Error('Unknown producer store')
  const collection = owner.fixture.store.$collections[0]!
  owner.fixture.cache.writeItem({ collection, key: collection.getKey(item)!, item })
}

/** Register real Core subscription through actual remote plugin and typed hooks. */
export async function subscribeProducer(storeId: string): Promise<void> {
  if (subscriptions.has(storeId))
    return
  const owner = stores.get(storeId)
  if (!owner)
    throw new Error('Unknown producer store')
  const request = { store: owner.fixture.store, collection: owner.fixture.store.$collections[0]!, subscriptionId: `sub-${storeId}` }
  await subscribe(request)
  subscriptions.set(storeId, () => unsubscribe(request))
}

/** Connect real iframe through official parent discovery; denied origins should never receive authority. */
export async function connect(options: { allowedOrigins?: string[], timeout?: number } = {}): Promise<void> {
  panel?.dispose()
  notifications = []
  panel = connectBrowserPanel({ targets: [window.parent], allowedOrigins: options.allowedOrigins })
  panel.subscribe(event => notifications.push(event))
  await panel.whenConnected(options.timeout ?? 3000)
}

/** Fetch detached DTO through selected iframe connection. */
export function read(request: ReadRequest) {
  if (!panel)
    throw new Error('Panel not connected')
  return panel.read(request)
}

/** Exercise shared executor, including schema failures and real committed cache effects. */
export function execute(action: Action) {
  if (!panel)
    throw new Error('Panel not connected')
  return panel.execute(action)
}

/** Observe Vue module refs through one explicit channel lease. */
export async function watch({ target, view }: { target: Target, view: ViewName }): Promise<void> {
  unwatch?.()
  if (!panel)
    throw new Error('Panel not connected')
  unwatch = await panel.watch(target, view)
}

/** Change producer-owned reactive state independently from inspector channel. */
export function changeModule(count: number): void {
  if (!moduleState)
    throw new Error('Producer not initialized')
  moduleState.count = count
}

/** Return detached notification log for bounded Playwright polling. */
export function getNotifications(): unknown[] {
  return notifications
}

/** Remove one registration and reattach same store with a new authority generation. */
export function replaceCore(): Target {
  if (!runtime || !fixtures[0])
    throw new Error('Producer not initialized')
  runtime.resolve(runtime.listStores().find(store => store.target.storeId === 'core')!.target).dispose()
  return runtime.attachStore(fixtures[0].store, { id: 'core' }).target
}

/** Release panel or producer resources in this browsing context only. */
export async function dispose(): Promise<void> {
  unwatch?.()
  unwatch = undefined
  panel?.dispose()
  panel = undefined
  runtime?.dispose()
  runtime = undefined
  for (const release of subscriptions.values()) await release()
  subscriptions.clear()
  for (const fixture of fixtures) fixture.dispose()
  fixtures.length = 0
  stores.clear()
  moduleState = undefined
  notifications = []
}
