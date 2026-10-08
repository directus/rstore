import { getSession, queue } from './offlineSession'

/** Persist two distinct saved updates with deterministic replay order. */
export async function seedUpdates() {
  // Native IndexedDB enumerates a-newest first; replay must follow timestamps.
  await queue({ id: 'z-oldest', time: new Date(10) })
  await queue({ id: 'a-newest', key: '2', item: { id: '2', text: 'second updated' }, time: new Date(20) })
}

/** Script a failure at the allowed remote service boundary. */
export function failUpdate(statusCode: number) {
  getSession().remote.failNext('updateItem', { statusCode } as any)
}

/** Recreate a queued delete whose target another client has already removed. */
export async function seedMissingDelete() {
  await queue({ type: 'delete', item: undefined })
  getSession().remote.seed('Todos', [{ id: '2', text: 'second' }, { id: '3', text: 'survivor' }])
  getSession().remote.failNext('deleteItem', { response: { status: 404 } } as any)
}

/** Restore optimistic local state while remote service assigns a different identity. */
export async function seedRenamedCreate() {
  const session = getSession()
  await session.db.writeItem('Todos', 'local-key', { id: 'local-key', text: 'draft' })
  session.cache.writeItem({ collection: session.collection, key: 'local-key', item: { id: 'local-key', text: 'draft' } })
  await queue({ type: 'create', key: 'local-key', item: { id: 'local-key', text: 'draft' } })
  session.remote.respondNext('createItem', () => ({ id: 'server-key', text: 'draft' }))
}
