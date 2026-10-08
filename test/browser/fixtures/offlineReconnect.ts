import { triggerOfflineSync } from '../../../packages/offline/src'
import { ONLINE_SYNC_DEBOUNCE_MS } from '../../../packages/offline/src/plugin/reconnect'
import { createDeferred } from '../../utils/deferred'
import { createSession } from './offlineSession'

let sessions: Awaited<ReturnType<typeof createSession>>[] = []
const pulls: number[] = []
let held: ReturnType<typeof createDeferred<void>> | undefined
let eventAt = 0
const connectivityEvents: string[] = []

/** Observe native connectivity events without substituting browser globals. */
function observeConnectivity(event: Event) {
  connectivityEvents.push(event.type)
  if (event.type === 'online')
    eventAt = Date.now()
}

/** Install real plugin reconnect listener and observe public sync consumer outputs. */
export async function initialize(replaced = false, reconnect = true) {
  window.addEventListener('online', observeConnectivity)
  window.addEventListener('offline', observeConnectivity)
  const total = replaced ? 2 : 1
  for (let index = 0; index < total; index++) {
    const session = await createSession({ reconnect })
    sessions.push(session)
    pulls.push(0)
    session.store.$hooks.hook('syncCollection', async ({ storeItems }: any) => {
      pulls[index]!++
      if (held)
        await held.promise
      storeItems([{ id: 'synced', text: `store-${index}-pull-${pulls[index]}` }])
    })
  }
}

/** Install the public reconnect opt-out with actual browser event handling. */
export async function initializeDisabled() {
  await initialize(false, false)
}

/** App-owned event handling invokes exported manual sync on actual installed store. */
export async function manualSync() {
  await triggerOfflineSync(sessions[0]!.store)
  return state()
}

/** Hold the permitted remote pull consumer response. */
export function holdPull() {
  held = createDeferred<void>()
}

/** Observe elapsed debounce interval separately from actual final work. */
export function state() {
  return {
    online: navigator.onLine,
    connectivityEvents,
    elapsed: Date.now() - eventAt,
    debounce: ONLINE_SYNC_DEBOUNCE_MS,
    pulls,
    syncing: sessions.map(session => session.store.$syncState.isSyncing),
    cache: sessions.map(session => session.cache.readItems({ collection: session.collection }).map(item => ({ ...item }))),
  }
}

/** Release held remote response and let public completion settle naturally. */
export function releasePull() {
  held?.resolve()
  held = undefined
}

/** Release pending dependency work and browser-owned cache/storage observers. */
export function cleanup() {
  releasePull()
  window.removeEventListener('online', observeConnectivity)
  window.removeEventListener('offline', observeConnectivity)
  for (const session of sessions) {
    session.db.dispose()
    session.dispose()
  }
  sessions = []
}
