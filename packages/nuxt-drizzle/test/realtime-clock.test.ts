import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('$rstore-drizzle-server-utils.js', () => ({
  dialect: 'postgresql',
}))
vi.mock('nitropack/runtime', () => ({
  defineNitroPlugin: (plugin: unknown) => plugin,
}))
vi.mock('../src/runtime/server/api/realtime.ws', () => ({
  closeAllRstoreDrizzlePeers: () => {},
}))

/** Install the publish-hooks Nitro plugin as Nitro would, on a fresh module graph. */
async function installNitroInstance(nodeId: string) {
  vi.stubEnv('RSTORE_DRIZZLE_NODE_ID', nodeId)
  const { default: plugin } = await import('../src/runtime/server/plugins/publish-hooks') as any
  plugin({ hooks: { hook: () => {} } })
  const pubsub = await import('../src/runtime/server/utils/pubsub')
  pubsub.setPubSub(pubsub.createMemoryPubSub())
  return import('../src/runtime/server/utils/realtime')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('realtime publish clock', () => {
  it('stamps with the adapter clock and leaves the process default clock alone', async () => {
    vi.resetModules()
    const clock = await import('@rstore/multiplayer/clock')
    const processDefault = clock.getDefaultClock()

    const realtime = await installNitroInstance('nitro-a')
    expect(clock.getDefaultClock()).toBe(processDefault)

    // Another server instance of the process installs its own default clock.
    clock.setDefaultClock(clock.createHLCClock('other-instance'))
    const updated = realtime.publishRstoreDrizzleRealtimeUpdate({ type: 'updated', collection: 'todos', key: 1, record: { id: 1, title: 'a' } })
    const deleted = realtime.publishRstoreDrizzleRealtimeUpdate({ type: 'deleted', collection: 'todos', key: 1, record: { id: 1 } })

    expect(clock.parseHLC(updated.fieldTimestamps!.title as string).nodeId).toBe('nitro-a')
    expect(clock.parseHLC(deleted.deletedAt as string).nodeId).toBe('nitro-a')
  })

  it('orders the stamps of one instance', async () => {
    vi.resetModules()
    const clock = await import('@rstore/multiplayer/clock')
    const realtime = await installNitroInstance('nitro-a')

    const first = realtime.publishRstoreDrizzleRealtimeUpdate({ type: 'created', collection: 'todos', key: 1, record: { id: 1 } })
    const second = realtime.publishRstoreDrizzleRealtimeUpdate({ type: 'created', collection: 'todos', key: 2, record: { id: 2 } })

    expect(clock.compareHLC(second.fieldTimestamps!.id!, first.fieldTimestamps!.id!)).toBeGreaterThan(0)
  })
})
