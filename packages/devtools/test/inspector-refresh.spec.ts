import type { InspectorTransport } from '../app/transport/types'
import type { Action, ReadReply, SessionSummary } from '../src/protocol'
import type { RuntimeInvalidation } from '../src/runtime/types'
import { describe, expect, it } from 'vitest'
import { createDeferred } from '../../../test/utils/deferred'
import { Inspector } from '../app/stores/connection'

/** External transport inputs exercise real inspector request and lease ownership. */
const target = { sessionId: 'browser', storeId: 'one', generation: 1 }
/** Live producer publication used across disconnect/recovery sequences. */
function session(connected: boolean): SessionSummary {
  return { sessionId: 'browser', label: 'Browser', kind: 'browser', connected, completed: false, startedAt: 1, stores: [{ target, label: 'One', capabilities: { cacheInspection: true, moduleObservation: true, cacheWrites: true, backendMutations: true, readOnly: false } }] }
}
/** Independently authored bounded cache row response. */
function cacheReply(collection: string): ReadReply {
  return { target, revision: 1, truncated: false, data: { rows: [{ key: 'shared', value: collection }], total: 1, matchingTotal: 1, offset: 0, limit: 100, scanTruncated: false } }
}

describe('inspector refresh recovery', () => {
  it('retires loading when pending view switches to an empty cache view', async () => {
    const pending = createDeferred<ReadReply>()
    const state = new Inspector()
    state.selection.select(target)
    state.view = 'modules'
    state.transport = { read: async () => pending.promise, dispose() {} } as InspectorTransport
    const work = state.refresh()
    try {
      expect(state.loading).toBe(true)
      await state.show('cache')
      pending.resolve({ target, revision: 1, truncated: false, data: [] })
      await work
      expect(state.loading).toBe(false)
      expect(state.reply).toBeNull()
      expect(state.readError).toBe('')
    }
    finally {
      pending.resolve({ target, revision: 1, truncated: false, data: [] })
      await work
      state.disconnect()
    }
  })

  it('removes stale cache rows and prevents their commands during collection switch', async () => {
    // Books and Authors share key; targeting current collection with old row would delete unseen Authors item.
    const pending = createDeferred<ReadReply>()
    const rows = new Map([['Books', 'Book title'], ['Authors', 'Author name']])
    const commands: Action[] = []
    const state = new Inspector()
    state.status = 'live'
    state.sessions = [session(true)]
    state.selection.select(target)
    state.view = 'cache'
    state.cache.select('Books')
    state.transport = {
      read: async (_view, _target, parameters) => parameters?.collection === 'Authors' ? pending.promise : cacheReply('Books'),
      action: async (command) => {
        commands.push(command)
        if ('collection' in command)
          rows.delete(command.collection)
        return { target, commandId: command.commandId, action: command.action, status: 'completed', revisions: {} }
      },
    } as InspectorTransport
    await state.refresh()
    expect(state.readError).toBe('')
    state.open('delete-cache-item', 'Books', 'shared')
    expect(state.draft?.collection).toBe('Books')
    state.draft = null
    state.cache.select('Authors')
    const work = state.refresh()
    try {
      expect(state.reply).toBeNull()
      for (const action of ['delete-cache-item', 'update-item', 'delete-item'] as const) {
        state.open(action, 'Authors', 'shared')
        expect(state.draft).toBeNull()
        await state.submit()
      }
      expect(commands).toEqual([])
      expect([...rows]).toEqual([['Books', 'Book title'], ['Authors', 'Author name']])
    }
    finally {
      pending.resolve(cacheReply('Authors'))
      await work
    }
    state.open('delete-cache-item', 'Authors', 'shared')
    expect(state.draft?.collection).toBe('Authors')
    state.draft!.confirmed = true
    await state.submit()
    expect(commands.map(command => 'collection' in command ? command.collection : '')).toEqual(['Authors'])
    expect([...rows]).toEqual([['Books', 'Book title']])
  })

  it('reacquires visible observation after same-target producer recovery', async () => {
    let connected = true
    let revision = 1
    let active = false
    const leases: string[] = []
    let invalidate!: (event: RuntimeInvalidation) => void
    const state = new Inspector()
    const transport: InspectorTransport = {
      listSessions: async () => [session(connected)],
      subscribe(listener) {
        invalidate = listener
        return () => {}
      },
      watch: async () => {
        active = true
        leases.push('acquire')
        return () => {
          active = false
          leases.push('release')
        }
      },
      read: async (_view, selected) => ({ target: selected, revision, truncated: false, data: [] }),
      action: async () => { throw new Error('Unexpected command') },
      dispose: () => {},
    }
    await state.connect(transport)
    try {
      expect(active).toBe(true)
      connected = false
      await state.publish()
      expect(active).toBe(false)
      connected = true
      await state.publish()
      expect(leases).toEqual(['acquire', 'release', 'acquire'])
      revision = 2
      if (active)
        invalidate({ target, view: 'collections', revision })
      await expect.poll(() => state.reply?.revision).toBe(2)
      // A rapid producer reconnect can coalesce both registry events into a live-only reply.
      active = false
      revision = 3
      await state.publish()
      expect(active).toBe(true)
      expect(state.reply?.revision).toBe(3)
    }
    finally { state.disconnect() }
  })

  it('publishes valid snapshots even while invalidations require another read', async () => {
    const replies = [createDeferred<ReadReply>(), createDeferred<ReadReply>()]
    let reads = 0
    let invalidate!: (event: RuntimeInvalidation) => void
    const state = new Inspector()
    await state.connect({
      listSessions: async () => [],
      subscribe(listener) {
        invalidate = listener
        return () => {}
      },
      read: async () => replies[reads++]!.promise,
      action: async () => { throw new Error('Unexpected command') },
      dispose: () => {},
    })
    state.selection.select(target)
    const work = state.refresh()
    try {
      invalidate({ target, view: 'collections', revision: 2 })
      replies[0]!.resolve({ target, revision: 1, truncated: false, data: [] })
      await work
      expect(reads).toBe(2)
      expect(state.reply?.revision).toBe(1)
    }
    finally {
      replies[1]!.resolve({ target, revision: 2, truncated: false, data: [] })
      await expect.poll(() => state.loading).toBe(false)
      state.disconnect()
    }
  })
})
