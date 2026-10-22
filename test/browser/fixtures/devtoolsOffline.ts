import { executeAction } from '../../../packages/devtools/src/actions'
import { createRstoreDevtools } from '../../../packages/devtools/src/runtime'
import { getSession, initialize, snapshot } from './offlineSession'

/** Browser-owned runtime uses actual offline plugin/native IndexedDB session. */
let runtime: ReturnType<typeof createRstoreDevtools> | undefined

/** Warm production imports and attach before browser loses HTTP access. */
export async function initializeDevtools() {
  await initialize()
  runtime = createRstoreDevtools({ kind: 'browser' })
  runtime.attachStore(getSession().store, { id: 'offline' })
}

/** Submit two exact-target actions and expose independent persisted/cache/remote evidence. */
export async function createOffline() {
  if (!runtime)
    throw new Error('Devtools browser fixture not initialized')
  const target = runtime.listStores()[0]!.target
  const outcomes = []
  for (const item of [{ id: 'devtools-one', text: 'First queued' }, { id: 'devtools-two', text: 'Second queued' }]) {
    outcomes.push(await executeAction(runtime, {
      target,
      commandId: crypto.randomUUID(),
      issuedAt: Date.now(),
      action: 'create-item',
      collection: 'Todos',
      item,
    }))
  }
  return { outcomes, snapshot: await snapshot() }
}

/** End inspector authority; existing offline session fixture owns store/database cleanup. */
export function disposeDevtools() {
  runtime?.dispose()
  runtime = undefined
}
