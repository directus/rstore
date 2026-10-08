import { findMany } from '@rstore/core'
import { triggerOfflineSync } from '../../../packages/offline/src'
import { createDeferred } from '../../utils/deferred'
import { getSession, initialize, queue, snapshot } from './offlineSession'

let releaseReplay: (() => void) | undefined
let completed = 0
let settled = 0
const rejected: string[] = []
let replies: Array<ReturnType<typeof createDeferred<void>>> = []
let included = true
let pendingWork = 0
let releaseFiltered: (() => void) | undefined
let filteredPulls: string[] = []
let filtering: ObservedWork | undefined

/** Start two public sync invocations while their remote replay is held. */
export async function startOverlapping(directHooks = false) {
  await queue({ item: { id: '1', text: 'updated' } })
  releaseReplay = getSession().remote.holdNext('updateItem')
  const store = getSession().store
  const run = directHooks
    ? () => store.$hooks.callHook('sync', {
        store,
        meta: {},
        setProgress: () => {},
        setCollectionLoaded: () => {},
        setCollectionSynced: () => {},
      })
    : () => store.$sync()
  for (const work of [run(), run()]) {
    pendingWork++
    work.then(
      () => {
        completed++
        settled++
        pendingWork--
      },
      (error) => {
        rejected.push(error?.message ?? String(error))
        settled++
        pendingWork--
      },
    )
  }
}

/** Observe pending replay without awaiting its held external response. */
export function overlapState() {
  return { calls: getSession().remote.callCount('updateItem'), completed, settled, rejected }
}

/** Release external response; tests observe completion through bounded contract polling. */
export function releaseOverlap() {
  releaseReplay?.()
}

/** Replay must precede a consumer's missing-row reconciliation. */
export async function replayBeforePull() {
  const session = getSession()
  await session.db.writeItem('Todos', 'offline-1', { id: 'offline-1', text: 'a' })
  await queue({ type: 'create', key: 'offline-1', item: { id: 'offline-1', text: 'a' } })
  let pullRemoteRows: any[] = []
  session.store.$hooks.hook('syncCollection', (payload: any) => {
    pullRemoteRows = session.remote.rows('Todos')
    const remoteKeys = new Set(session.remote.rows('Todos').map(row => row.id))
    payload.deleteItems(payload.loadedItems().map((item: any) => item.id).filter((key: string) => !remoteKeys.has(key)))
  })
  await session.store.$sync()
  return { ...await snapshot(), pullRemoteRows }
}

/** Each completed sync must permit fresh consumer pull work. */
export async function freshPulls() {
  const session = getSession()
  let pulls = 0
  session.store.$hooks.hook('syncCollection', ({ storeItems }: any) => {
    storeItems([{ id: '1', text: `pull-${++pulls}` }])
  })
  await session.store.$sync()
  const first = await snapshot()
  await session.store.$sync()
  return { first, second: await snapshot(), pulls }
}

/** State of a held collection pull observed separately from its public promise. */
interface ObservedWork {
  /** Public sync completion, observed without adopting its promise. */
  settled: boolean
  /** Unexpected direct rejection from public work. */
  rejected?: string
}

/** Held external collection work used by timeout and cancellation scenarios. */
interface RecoveryWork extends ObservedWork {
  /** Held external response released even after failed assertions. */
  reply: ReturnType<typeof createDeferred<void>>
  /** Unregister consumer callback before subsequent valid sync. */
  remove: () => void
  /** Public caller cancellation when exercising abort behavior. */
  controller?: AbortController
  /** Actual collection consumer started. */
  started: boolean
}

let recovery: RecoveryWork | undefined

/** Observe both success and rejection without producing unhandled derived promises. */
function observeRecovery(work: Promise<void>, state: ObservedWork) {
  pendingWork++
  work.then(
    () => {
      state.settled = true
      pendingWork--
    },
    (error) => {
      state.rejected = error?.message ?? String(error)
      state.settled = true
      pendingWork--
    },
  )
}

/** Start held pull without adopting a potentially broken completion promise. */
export function startRecovery(cancel = false) {
  const session = getSession()
  const reply = createDeferred<void>()
  replies.push(reply)
  const controller = cancel ? new AbortController() : undefined
  const state: RecoveryWork = { reply, controller, remove: () => {}, started: false, settled: false }
  state.remove = session.store.$hooks.hook('syncCollection', async () => {
    state.started = true
    await reply.promise
  })
  recovery = state
  observeRecovery(triggerOfflineSync(session.store, { signal: controller?.signal }), state)
}

/** Observe actual pull entry and completion independently of pending sync promise. */
export function recoveryState() {
  return {
    started: recovery?.started,
    settled: recovery?.settled,
    rejected: recovery?.rejected,
    error: getSession().store.$syncState.error?.message,
  }
}

/** Cancel through exported public caller signal after actual collection pull starts. */
export function abortRecovery() {
  recovery?.controller?.abort(new Error('cancelled by caller'))
}

/** Write through resumed cache, then release and unregister held dependency callback. */
export async function finishRecovery() {
  const session = getSession()
  session.cache.writeItem({ collection: session.collection, key: 'after-failure', item: { id: 'after-failure' } })
  const resumed = await snapshot()
  recovery?.reply.resolve()
  recovery?.remove()
  return resumed
}

/** Start actual valid later pull returning two independent rows after timeout recovery. */
export function startValidRecovery() {
  const session = getSession()
  const remove = session.store.$hooks.hook('syncCollection', ({ storeItems, deleteItems }: any) => {
    deleteItems(['after-failure'])
    storeItems([{ id: 'recovered-1', text: 'first' }, { id: 'recovered-2', text: 'second' }])
  })
  const state: RecoveryWork = {
    reply: createDeferred<void>(),
    remove,
    started: true,
    settled: false,
  }
  recovery = state
  observeRecovery(triggerOfflineSync(session.store), state)
}

/** Fetch through actual query pipeline; simulated external response can be held. */
function installFilteredPull() {
  const session = getSession()
  return session.store.$hooks.hook('syncCollection', async (payload: any) => {
    filteredPulls.push(payload.collection.name)
    const { result } = await findMany({ store: session.store, collection: payload.collection, findOptions: { fetchPolicy: 'no-cache' } })
    payload.storeItems(result.map(item => ({ ...item })))
  })
}

/** Prove configured predicate permits actual selected work alongside denied work. */
export async function pullSelected() {
  const remove = installFilteredPull()
  try {
    await getSession().store.$sync()
    return filteredSnapshot()
  }
  finally {
    remove()
  }
}

/** Start held selected pull without adopting original public completion promise. */
export function startExcludedPull() {
  releaseFiltered = getSession().remote.holdNext('fetchMany')
  const remove = installFilteredPull()
  filtering = { settled: false }
  observeRecovery(getSession().store.$sync().finally(remove), filtering)
}

/** Observe real consumer entry and remote call before exclusion changes. */
export function excludedPullState() {
  return { pulls: filteredPulls, calls: getSession().remote.callCount('fetchMany'), ...filtering }
}

/** Flip public predicate while remote response remains held, then release response. */
export function excludeAndRelease() {
  included = false
  releaseFiltered?.()
}

/** Read exact selected/denied cache and mirror effects independently. */
export async function filteredSnapshot() {
  const session = getSession()
  const notes = session.store.$collections.find(collection => collection.name === 'Notes')!
  return {
    ...await snapshot(),
    pulls: filteredPulls,
    notesCache: session.cache.readItems({ collection: notes }).map(item => ({ ...item })),
    notesMirror: await session.db.readAllItems('Notes'),
    metadata: localStorage.getItem('rstore-offline-metadata-Todos'),
    notesMetadata: localStorage.getItem('rstore-offline-metadata-Notes'),
  }
}

/** Existing cursor survives opt-out and remains next pull's exact high-water mark. */
export async function skipCursor() {
  const session = getSession()
  const cursor = JSON.stringify({ updatedAt: 123 })
  localStorage.setItem('rstore-offline-metadata-Todos', cursor)
  const pulls: number[] = []
  session.store.$hooks.hook('syncCollection', (payload: any) => {
    pulls.push(payload.lastUpdatedAt.getTime())
    payload.skipCursor()
  })
  await session.store.$sync()
  const afterSkip = localStorage.getItem('rstore-offline-metadata-Todos')
  await session.store.$sync()
  return { afterSkip, afterNextPull: localStorage.getItem('rstore-offline-metadata-Todos'), pulls }
}

/** Observe real time before asynchronous pull completion and persisted cursor afterward. */
export async function cursorBeforePull() {
  const session = getSession()
  let started = 0
  let finished = 0
  session.store.$hooks.hook('syncCollection', async () => {
    started = Date.now()
    // Remote service delay gives cursor capture a distinct completion boundary.
    await new Promise(resolve => setTimeout(resolve, 20))
    finished = Date.now()
  })
  await session.store.$sync()
  return { started, finished, cursor: JSON.parse(localStorage.getItem('rstore-offline-metadata-Todos')!).updatedAt }
}

/** Initialize public inclusion predicate without replacing runtime globals. */
export async function initializeFiltered() {
  included = true
  filteredPulls = []
  await initialize({ filterCollection: collection => collection.name === 'Todos' && included }, ['Todos', 'Notes'])
  const session = getSession()
  session.remote.seed('Todos', [{ id: 'server-row', text: 'allowed' }])
  session.remote.seed('Notes', [{ id: 'private-row', text: 'denied' }])
  await session.db.writeItem('Notes', 'kept-note', { id: 'kept-note', text: 'private mirror' })
  localStorage.setItem('rstore-offline-metadata-Notes', JSON.stringify({ updatedAt: 456 }))
}

/** Release external held work on assertion failures without awaiting broken completion forever. */
export function cleanup() {
  releaseReplay?.()
  releaseFiltered?.()
  for (const reply of replies)
    reply.resolve()
  replies = []
  recovery?.reply.resolve()
  recovery?.remove()
}

/** Bounded test teardown observes released external work instead of awaiting it indefinitely. */
export function cleanupState() {
  return { pendingWork }
}
