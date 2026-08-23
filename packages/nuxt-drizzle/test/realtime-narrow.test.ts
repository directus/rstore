import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Exercises `realtime.filter`'s `narrowRecord`, which delivers a column subset
// of a published record to one peer without affecting the frame every other
// peer receives. See `./utils/ws` for the fake-peer helpers.
import { expectNoMatch, getWsHooks as getHooks, makeMessage, makePeer, waitFor } from './utils/ws'

vi.mock('$rstore-drizzle-server-utils.js', () => ({
  dialect: 'postgresql',
}))

/** Frame a peer received, unwrapping the single- and batched-update shapes. */
function firstUpdate(peer: { sent: any[] }) {
  const frame = peer.sent.find((s: any) => s?.update || s?.updates)
  return frame?.update ?? frame?.updates?.[0]
}

/** Every update a peer received, in arrival order. */
function allUpdates(peer: { sent: any[] }) {
  return peer.sent.flatMap((s: any) => s?.update ? [s.update] : s?.updates ?? [])
}

describe('realtime.filter narrowing', () => {
  let pubsubModule: typeof import('../src/runtime/server/utils/pubsub')
  let hooksModule: typeof import('../src/runtime/server/utils/hooks')

  beforeEach(async () => {
    vi.resetModules()
    pubsubModule = await import('../src/runtime/server/utils/pubsub')
    hooksModule = await import('../src/runtime/server/utils/hooks')
    pubsubModule.setPubSub(pubsubModule.createMemoryPubSub())
  })

  afterEach(() => {
    ;(hooksModule.rstoreDrizzleHooks as any)._hooks = {}
  })

  /** Opens a peer and subscribes it to `todos`, optionally with a filter. */
  async function subscribe(id: string, where?: unknown) {
    const hooks = await getHooks()
    const peer = makePeer(id)
    hooks.open(peer)
    await hooks.message(peer, makeMessage({
      subscription: { action: 'subscribe', collection: 'todos', where },
    }))
    return peer
  }

  it('delivers only the narrowed columns', async () => {
    hooksModule.rstoreDrizzleHooks.hook('realtime.filter', ({ record, narrowRecord }) => {
      narrowRecord({ id: (record as any).id, title: (record as any).title })
    })
    const peer = await subscribe('a')

    pubsubModule.getPubSub().publish('update', {
      type: 'created',
      collection: 'todos',
      key: undefined as any,
      record: { id: 1, title: 'Ship it', ownerEmail: 'leia@example.com' },
    })

    const update = await waitFor(() => firstUpdate(peer))
    expect(update.record).toEqual({ id: 1, title: 'Ship it' })
    expect(update.record).not.toHaveProperty('ownerEmail')
  })

  it('never mutates the payload shared with the other peers', async () => {
    hooksModule.rstoreDrizzleHooks.hook('realtime.filter', ({ peer, record, narrowRecord }) => {
      if ((peer as any).id === 'a') {
        narrowRecord({ id: (record as any).id })
      }
    })
    const peerA = await subscribe('a')
    const peerB = await subscribe('b')
    const published = {
      type: 'created' as const,
      collection: 'todos',
      key: undefined as any,
      record: { id: 1, ownerEmail: 'leia@example.com' },
    }

    pubsubModule.getPubSub().publish('update', published)

    const aUpdate = await waitFor(() => firstUpdate(peerA))
    const bUpdate = await waitFor(() => firstUpdate(peerB))
    expect(aUpdate.record).toEqual({ id: 1 })
    expect(bUpdate.record).toHaveProperty('ownerEmail')
    // The un-narrowed peer keeps the published object by identity, so the
    // common path still shares one frame instead of copying per peer.
    expect(bUpdate.record).toBe(published.record)
    expect(published.record).toHaveProperty('ownerEmail')
  })

  it('does not copy the frame when no handler narrows', async () => {
    let calls = 0
    hooksModule.rstoreDrizzleHooks.hook('realtime.filter', () => {
      calls++
    })
    const peer = await subscribe('a')
    const published = {
      type: 'created' as const,
      collection: 'todos',
      key: undefined as any,
      record: { id: 1 },
    }

    pubsubModule.getPubSub().publish('update', published)

    const update = await waitFor(() => firstUpdate(peer))
    expect(calls).toBe(1)
    expect(update).toBe(published)
  })

  it('narrows fieldTimestamps alongside the record', async () => {
    hooksModule.rstoreDrizzleHooks.hook('realtime.filter', ({ record, narrowRecord }) => {
      narrowRecord({ id: (record as any).id, title: (record as any).title })
    })
    const peer = await subscribe('a')

    pubsubModule.getPubSub().publish('update', {
      type: 'updated',
      collection: 'todos',
      key: '1',
      record: { id: 1, title: 'Ship it', ownerEmail: 'leia@example.com' },
      fieldTimestamps: { id: '1-0-a', title: '2-0-a', ownerEmail: '3-0-a' },
    } as any)

    const update = await waitFor(() => firstUpdate(peer))
    // Keeping a *newer* stamp for a field the frame no longer carries makes
    // the client's per-field merge resolve it to `undefined` — i.e. narrowing
    // would silently erase the cached value.
    expect(Object.keys(update.fieldTimestamps).sort()).toEqual(['id', 'title'])
    expect(update.fieldTimestamps).not.toHaveProperty('ownerEmail')
  })

  it('leaves fieldTimestamps absent when the publish carried none', async () => {
    hooksModule.rstoreDrizzleHooks.hook('realtime.filter', ({ record, narrowRecord }) => {
      narrowRecord({ id: (record as any).id })
    })
    const peer = await subscribe('a')

    pubsubModule.getPubSub().publish('update', {
      type: 'updated',
      collection: 'todos',
      key: '1',
      record: { id: 1, ownerEmail: 'leia@example.com' },
    })

    const update = await waitFor(() => firstUpdate(peer))
    expect(update.fieldTimestamps).toBeUndefined()
  })

  it('strips previousRecord while narrowing', async () => {
    hooksModule.rstoreDrizzleHooks.hook('realtime.filter', ({ record, narrowRecord }) => {
      narrowRecord({ id: (record as any).id })
    })
    const peer = await subscribe('a')

    pubsubModule.getPubSub().publish('update', {
      type: 'updated',
      collection: 'todos',
      key: '1',
      record: { id: 1, title: 'new' },
      previousRecord: { id: 1, title: 'old' },
    } as any)

    const update = await waitFor(() => firstUpdate(peer))
    expect('previousRecord' in update).toBe(false)
  })

  it('narrows a deleted frame without touching its tombstone stamp', async () => {
    hooksModule.rstoreDrizzleHooks.hook('realtime.filter', ({ record, narrowRecord }) => {
      narrowRecord({ id: (record as any).id })
    })
    const peer = await subscribe('a')

    pubsubModule.getPubSub().publish('update', {
      type: 'deleted',
      collection: 'todos',
      key: '1',
      record: { id: 1, ownerEmail: 'leia@example.com' },
      deletedAt: '4-0-a',
    } as any)

    const update = await waitFor(() => firstUpdate(peer))
    expect(update.record).toEqual({ id: 1 })
    expect(update.deletedAt).toBe('4-0-a')
  })

  it('lets reject win over a narrowing handler, in either order', async () => {
    hooksModule.rstoreDrizzleHooks.hook('realtime.filter', ({ peer, record, narrowRecord, reject }) => {
      if ((peer as any).id === 'a') {
        narrowRecord({ id: (record as any).id })
        reject()
      }
      else {
        reject()
        narrowRecord({ id: (record as any).id })
      }
    })
    const peerA = await subscribe('a')
    const peerB = await subscribe('b')

    pubsubModule.getPubSub().publish('update', {
      type: 'created',
      collection: 'todos',
      key: undefined as any,
      record: { id: 1 },
    })

    await expectNoMatch(() => firstUpdate(peerA))
    await expectNoMatch(() => firstUpdate(peerB))
  })

  it('lets a rejecting handler win over a narrowing one', async () => {
    hooksModule.rstoreDrizzleHooks.hook('realtime.filter', ({ record, narrowRecord }) => {
      narrowRecord({ id: (record as any).id })
    })
    hooksModule.rstoreDrizzleHooks.hook('realtime.filter', ({ reject }) => {
      reject()
    })
    const peer = await subscribe('a')

    pubsubModule.getPubSub().publish('update', {
      type: 'created',
      collection: 'todos',
      key: undefined as any,
      record: { id: 1 },
    })

    await expectNoMatch(() => firstUpdate(peer))
  })

  it('intersects successive narrowing calls regardless of order', async () => {
    // Registered A-then-B for peer `a` and B-then-A for peer `b`: both must
    // land on the intersection, otherwise the surviving columns would depend
    // on Nitro plugin registration order.
    const narrowWide = ({ record, narrowRecord }: any) =>
      narrowRecord({ id: record.id, title: record.title })
    const narrowNarrow = ({ record, narrowRecord }: any) =>
      narrowRecord({ id: record.id, ownerEmail: record.ownerEmail })

    hooksModule.rstoreDrizzleHooks.hook('realtime.filter', (payload: any) => {
      if (payload.peer.id === 'a') {
        narrowWide(payload)
      }
      else {
        narrowNarrow(payload)
      }
    })
    hooksModule.rstoreDrizzleHooks.hook('realtime.filter', (payload: any) => {
      if (payload.peer.id === 'a') {
        narrowNarrow(payload)
      }
      else {
        narrowWide(payload)
      }
    })
    const peerA = await subscribe('a')
    const peerB = await subscribe('b')

    pubsubModule.getPubSub().publish('update', {
      type: 'created',
      collection: 'todos',
      key: undefined as any,
      record: { id: 1, title: 'Ship it', ownerEmail: 'leia@example.com' },
    })

    expect((await waitFor(() => firstUpdate(peerA))).record).toEqual({ id: 1 })
    expect((await waitFor(() => firstUpdate(peerB))).record).toEqual({ id: 1 })
  })

  it('ignores columns absent from the published record and invalid input', async () => {
    hooksModule.rstoreDrizzleHooks.hook('realtime.filter', ({ peer, record, narrowRecord }) => {
      if ((peer as any).id === 'a') {
        narrowRecord({ id: (record as any).id, injected: 'nope' } as any)
      }
      else {
        narrowRecord(null as any)
      }
    })
    const peerA = await subscribe('a')
    const peerB = await subscribe('b')

    pubsubModule.getPubSub().publish('update', {
      type: 'created',
      collection: 'todos',
      key: undefined as any,
      record: { id: 1, title: 'Ship it' },
    })

    const aUpdate = await waitFor(() => firstUpdate(peerA))
    expect(aUpdate.record).toEqual({ id: 1 })
    // A non-object argument is a no-op rather than a thrown fan-out.
    const bUpdate = await waitFor(() => firstUpdate(peerB))
    expect(bUpdate.record).toEqual({ id: 1, title: 'Ship it' })
  })

  it('narrows after where matching, so a filtered subscription still matches', async () => {
    hooksModule.rstoreDrizzleHooks.hook('realtime.filter', ({ record, narrowRecord }) => {
      narrowRecord({ id: (record as any).id })
    })
    const peer = await subscribe('a', { operator: 'eq', field: 'ownerEmail', value: 'leia@example.com' })

    pubsubModule.getPubSub().publish('update', {
      type: 'created',
      collection: 'todos',
      key: undefined as any,
      record: { id: 1, ownerEmail: 'leia@example.com' },
    })

    // Matching runs on the full record; narrowing only shapes the wire frame.
    const update = await waitFor(() => firstUpdate(peer))
    expect(update.record).toEqual({ id: 1 })
  })

  it('keeps narrowing per peer across a batched updates frame', async () => {
    hooksModule.rstoreDrizzleHooks.hook('realtime.filter', ({ peer, record, narrowRecord }) => {
      if ((peer as any).id === 'a') {
        narrowRecord({ id: (record as any).id })
      }
    })
    const peerA = await subscribe('a')
    const peerB = await subscribe('b')

    for (const id of [1, 2, 3]) {
      pubsubModule.getPubSub().publish('update', {
        type: 'created',
        collection: 'todos',
        key: undefined as any,
        record: { id, ownerEmail: 'leia@example.com' },
      })
    }

    await waitFor(() => allUpdates(peerA).length === 3 || undefined)
    await waitFor(() => allUpdates(peerB).length === 3 || undefined)
    expect(allUpdates(peerA).map(u => u.record)).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(allUpdates(peerB).every(u => 'ownerEmail' in u.record)).toBe(true)
  })
})
