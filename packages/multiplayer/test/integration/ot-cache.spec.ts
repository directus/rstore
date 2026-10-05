import type { CollabClient } from '@rstore/multiplayer/ot'
import { createTestStore } from '#test-utils/store/integrationStore'
import { bindCollabCache, createMultiplayerPlugin, OT_NAMESPACE } from '@rstore/multiplayer'
import { describe, expect, it } from 'vitest'
import { insertText } from '../ot/harness/edits'
import { createSimulation } from '../ot/harness/simulation'

const doc = [{ id: 'p1', content: 'hello' }, { id: 'p2', content: 'world' }]

/** A store with the plugin in OT mode for `docNodes`, bound to a collab client. */
async function bindStore(client: CollabClient) {
  const store = await createTestStore({
    schema: [{ name: 'docNodes' }, { name: 'todos' }],
    plugins: [createMultiplayerPlugin({ ot: { collections: ['docNodes'] }, tombstoneGc: false })],
  }) as any
  const collection = store.$collections.find((c: any) => c.name === 'docNodes')
  const unbind = bindCollabCache(store, client, { collection: 'docNodes' })
  return {
    store,
    unbind,
    /** Row as queries see it (pending edits included). */
    read: (key: string) => store.$cache.readItem({ collection, key }),
    /** Committed row, without layers. */
    committed: (key: string) => store.$cache.getState().collections.docNodes?.[key],
    /** Writes a realtime row frame. */
    frame: (item: Record<string, any>) => store.$cache.writeItem({ collection, key: item.id, item }),
    meta: (key: string) => store.$cache.itemMetadata.read(OT_NAMESPACE, 'docNodes', key),
  }
}

describe('collab documents in the rstore cache', () => {
  it('shows pending edits through a layer and commits confirmed rows with their version', async () => {
    const sim = await createSimulation(doc)
    const a = await bindStore(sim.clients.A!.client)
    expect(a.committed('p1')).toMatchObject({ content: [{ insert: 'hello' }], version: 0 })

    sim.clients.A!.edit([insertText('p1', 5, '!')])
    expect(a.read('p1')).toMatchObject({ content: [{ insert: 'hello!' }] })
    expect(a.committed('p1')).toMatchObject({ content: [{ insert: 'hello' }] })

    await sim.flush()
    expect(a.committed('p1')).toMatchObject({ content: [{ insert: 'hello!' }], version: 1 })
    expect(a.meta('p1')).toEqual({ docId: 'doc', version: 1 })
    expect(a.store.$cache.getLayer('multiplayer-ot:doc')?.state ?? {}).toEqual({})
  })

  it('commits remote edits and lists pending nodes in queries', async () => {
    const sim = await createSimulation(doc)
    const a = await bindStore(sim.clients.A!.client)
    sim.clients.B!.edit([insertText('p2', 0, 'big ')])
    await sim.flush()
    expect(a.committed('p2')).toMatchObject({ content: [{ insert: 'big world' }], version: 1 })

    sim.clients.A!.edit([{ t: 'insertNode', node: { id: 'p3', parentId: null, orderKey: 'a5', type: 'paragraph', attrs: {}, content: [] } }])
    expect(a.store.docNodes.peekMany().map((node: any) => node.id).sort()).toEqual(['p1', 'p2', 'p3'])
  })

  it('drops row frames that are not newer than the cached version', async () => {
    const sim = await createSimulation(doc)
    const a = await bindStore(sim.clients.A!.client)
    sim.clients.A!.edit([insertText('p1', 5, '!')])
    await sim.flush()

    // The same change published by the realtime layer (and an older one) are dropped.
    a.frame({ id: 'p1', docId: 'doc', content: [{ insert: 'stale' }], version: 1 })
    a.frame({ id: 'p1', docId: 'doc', content: [{ insert: 'older' }], version: 0 })
    expect(a.committed('p1')).toMatchObject({ content: [{ insert: 'hello!' }], version: 1 })

    // A newer row (published before its collab frame arrives) lands.
    a.frame({ id: 'p1', docId: 'doc', content: [{ insert: 'newer' }], version: 2 })
    expect(a.committed('p1')).toMatchObject({ content: [{ insert: 'newer' }], version: 2 })
    expect(a.meta('p1')).toEqual({ docId: 'doc', version: 2 })
  })

  it('orders stamped row frames of node collections by version, not by field stamps', async () => {
    const sim = await createSimulation(doc)
    const a = await bindStore(sim.clients.A!.client)
    const collection = a.store.$collections.find((c: any) => c.name === 'docNodes')
    const write = (text: string, version: number, stamp: string) => a.store.$cache.writeItem({ collection, key: 'p1', item: { id: 'p1', docId: 'doc', content: [{ insert: text }], version }, metadata: { fieldTimestamps: { content: stamp } } })
    write('stale', 0, '9999999999999:0:z')
    expect(a.committed('p1')).toMatchObject({ content: [{ insert: 'hello' }], version: 0 })
    // Two server instances with skewed clocks: the newer version wins even with an older stamp.
    write('v1', 1, '0000000000002:0:a')
    write('v2', 2, '0000000000001:0:b')
    expect(a.committed('p1')).toMatchObject({ content: [{ insert: 'v2' }], version: 2 })
  })

  it('removes rolled back edits from the cache', async () => {
    const sim = await createSimulation(doc, {
      server: { hooks: { filterOp: ({ op }) => op.t === 'text' && op.node === 'p2' ? 'forbidden' : undefined } },
    })
    const a = await bindStore(sim.clients.A!.client)
    sim.clients.A!.edit([insertText('p2', 0, 'no ')])
    expect(a.read('p2')).toMatchObject({ content: [{ insert: 'no world' }] })
    await sim.flush()
    expect(a.read('p2')).toMatchObject({ content: [{ insert: 'world' }] })
  })

  it('stops following the client once unbound', async () => {
    const sim = await createSimulation(doc)
    const a = await bindStore(sim.clients.A!.client)
    a.unbind()
    sim.clients.B!.edit([insertText('p1', 0, '>')])
    await sim.flush()
    expect(a.committed('p1')).toMatchObject({ content: [{ insert: 'hello' }], version: 0 })
    expect(a.store.$cache.getLayer('multiplayer-ot:doc')).toBeUndefined()
  })
})
