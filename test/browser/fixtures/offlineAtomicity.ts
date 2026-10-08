import { useIndexedDb } from '../../../packages/offline/src/indexeddb'

/** Independently observable native transaction workflow. */
interface AtomicityState {
  /** Last operation entered, including stalled public operations. */
  phase: 'seed' | 'rollback' | 'rolled-back' | 'retry' | 'complete'
  /** Original public rejection reason. */
  failure: string | null
  /** Rows read through separate transaction after rejected public operation. */
  afterFailure?: any[]
  /** Rows read after valid public retry completes. */
  afterRetry?: any[]
  /** Unexpected workflow error, distinct from expected clone rejection. */
  error?: string
}

let storage: Awaited<ReturnType<typeof useIndexedDb>> | undefined
let reader: Awaited<ReturnType<typeof useIndexedDb>> | undefined
const observed: AtomicityState = { phase: 'seed', failure: null }

/** Capture unexpected work errors without returning/adopting pending operation. */
function observe(work: Promise<void>) {
  work.catch((error) => {
    observed.error = error?.message ?? String(error)
  })
}

/** Acquire public handles without starting DB work that could stall completion. */
export async function initialize() {
  const name = `atomicity-${crypto.randomUUID()}`
  storage = await useIndexedDb(name)
  reader = await useIndexedDb(name)
}

/** Begin native seed and failed transaction; Playwright observes published state. */
export function startRollback() {
  observe((async () => {
    await storage!.writeItem('Todos', 'gone', { id: 'gone', text: 'Keep until commit' })
    await storage!.writeItem('Todos', 'survivor', { id: 'survivor', done: false })
    observed.phase = 'rollback'
    try {
      await storage!.applyChanges('Todos', {
        deleteKeys: ['gone'],
        writes: [
          { key: 'new', value: { id: 'new', text: 'Must roll back' } },
          { key: 'invalid', value: { id: 'invalid', callback: () => undefined } },
        ],
      })
    }
    catch (error) {
      observed.failure = error instanceof DOMException ? error.name : String(error)
    }
    observed.afterFailure = await reader!.readAllItems('Todos')
    observed.phase = 'rolled-back'
  })())
}

/** Begin valid retry independently of browser evaluation's own completion. */
export function startRetry() {
  observed.phase = 'retry'
  observe((async () => {
    await storage!.applyChanges('Todos', {
      deleteKeys: ['gone'],
      writes: [
        { key: 'new', value: { id: 'new', text: 'Committed retry' } },
        { key: 'valid', value: { id: 'valid', done: true } },
      ],
    })
    observed.afterRetry = await reader!.readAllItems('Todos')
    observed.phase = 'complete'
  })())
}

/** Read actual public completion and fresh native persistence evidence. */
export function state() {
  return observed
}

/** Release acquired leases without awaiting potentially stalled work. */
export function dispose() {
  storage?.dispose()
  reader?.dispose()
  storage = undefined
  reader = undefined
  return { disposed: true }
}
