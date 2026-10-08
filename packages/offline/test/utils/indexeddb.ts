import type { IDBFactory } from 'fake-indexeddb'

/** Observable native deletion events, including a blocked intermediate state. */
export interface DatabaseDeletion {
  /** First event distinguishes a held lease from premature deletion. */
  firstEvent: 'blocked' | 'success' | 'error' | null
  /** Whether the request settled, independently of any earlier blocked event. */
  settled: boolean
  /** Error reported by IndexedDB, if deletion failed. */
  error: DOMException | null
}

/** Start deletion and observe all events without creating a rejecting promise. */
export function observeDatabaseDeletion(factory: IDBFactory, name: string): DatabaseDeletion {
  const state: DatabaseDeletion = { firstEvent: null, settled: false, error: null }
  const request = factory.deleteDatabase(name)
  request.addEventListener('blocked', () => {
    state.firstEvent ??= 'blocked'
  })
  request.addEventListener('success', () => {
    state.firstEvent ??= 'success'
    state.settled = true
  })
  request.addEventListener('error', () => {
    state.firstEvent ??= 'error'
    state.error = request.error
    state.settled = true
  })
  return state
}
