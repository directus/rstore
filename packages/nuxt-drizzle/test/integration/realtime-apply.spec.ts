import type { SubscriptionUpdateMessage } from '../../src/runtime/utils/realtime'
import { createVueStack } from '#test-utils/store/vueStack'
import { createMultiplayerPlugin, getFieldTimestamps, getTombstone } from '@rstore/multiplayer'
import { stringifyHLC } from '@rstore/multiplayer/clock'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyRealtimeUpdate } from '../../src/runtime/utils/realtime-apply'

/** HLC string at `physical` ms. */
function hlc(physical: number, nodeId = 'server') {
  return stringifyHLC({ physical, logical: 0, nodeId })
}

/** Store holding todo 1, with or without the multiplayer plugin (`ws.lww`). */
async function setup(lww: boolean) {
  const { store, read } = await createVueStack({
    schema: [{ name: 'todos' }],
    remote: false,
    plugins: lww ? [createMultiplayerPlugin({ tombstoneGc: false, formTextMerge: false })] : [],
  })
  return { store: store as any, read }
}

function updated(record: Record<string, any>, fieldTimestamps?: Record<string, string>): SubscriptionUpdateMessage {
  return { type: 'updated', collection: 'todos', key: String(record.id), record, fieldTimestamps }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('applyRealtimeUpdate with the multiplayer plugin', () => {
  it('writes stamped frames through metadata: an older frame loses field by field', async () => {
    const { store, read } = await setup(true)

    applyRealtimeUpdate(store, updated({ id: 1, title: 'new', done: true }, { title: hlc(2000), done: hlc(1000) }))
    applyRealtimeUpdate(store, updated({ id: 1, title: 'stale', done: false }, { title: hlc(1500), done: hlc(1500) }))

    expect(read('todos', 1)?.$raw()).toEqual({ id: 1, title: 'new', done: false })
    expect(getFieldTimestamps(store, 'todos', 1)).toEqual({ id: 0, title: hlc(2000), done: hlc(1500) })
  })

  it('records the deletedAt of a deleted frame as a tombstone that drops older writes', async () => {
    const { store, read } = await setup(true)
    applyRealtimeUpdate(store, updated({ id: 1, title: 'a' }, { id: hlc(1000), title: hlc(1000) }))

    applyRealtimeUpdate(store, { type: 'deleted', collection: 'todos', key: '1', record: undefined as any, deletedAt: hlc(3000) })
    applyRealtimeUpdate(store, updated({ id: 1, title: 'late' }, { id: hlc(2000), title: hlc(2000) }))

    expect(read('todos', 1)).toBeUndefined()
    expect(getTombstone(store, 'todos', 1)?.deletedAt).toBe(hlc(3000))
  })

  it('writes unstamped (v1) frames as plain writes', async () => {
    const { store, read } = await setup(true)

    applyRealtimeUpdate(store, { type: 'created', collection: 'todos', key: '1', record: { id: 1, title: 'a' } })

    expect(read('todos', 1)?.$raw()).toEqual({ id: 1, title: 'a' })
  })
})

describe('applyRealtimeUpdate without the plugin (ws.lww: false)', () => {
  it('overwrites with a stamped frame and warns about the unhandled stamps', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { store, read } = await setup(false)

    applyRealtimeUpdate(store, updated({ id: 1, title: 'new' }, { title: hlc(2000) }))
    applyRealtimeUpdate(store, updated({ id: 1, title: 'stale' }, { title: hlc(1000) }))

    expect(read('todos', 1)?.$raw()).toEqual({ id: 1, title: 'stale' })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"fieldTimestamps"'))
  })
})

describe('applyRealtimeUpdate errors', () => {
  it('rejects frames of unknown collections', async () => {
    const { store } = await setup(true)
    expect(() => applyRealtimeUpdate(store, { type: 'created', collection: 'nope', key: '1', record: { id: 1 } })).toThrow(/nope/)
  })
})
