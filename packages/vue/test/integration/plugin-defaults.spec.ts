import type { Plugin } from '@rstore/shared'
import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it } from 'vitest'

/** Plugin registering collection defaults during store setup. */
function defaultsPlugin(name: string, defaults: Record<string, any>): Plugin {
  return {
    name,
    setup({ addCollectionDefaults }) {
      addCollectionDefaults(defaults)
    },
  }
}

describe('plugin collection defaults', () => {
  it('merges computed and meta defaults before wrapped items become observable', async () => {
    const stack = await createVueStack({
      schema: [
        { name: 'items' },
        { name: 'owned', computed: { priority: () => 'collection' }, meta: { owner: 'collection' } as any },
      ],
      collectionDefaults: {
        computed: { existing: () => 'existing', priority: () => 'initial' },
        meta: { initial: true, owner: 'initial' },
      } as any,
      plugins: [
        defaultsPlugin('first-defaults', {
          computed: { plugin: () => 'plugin', priority: () => 'first' },
          meta: { plugin: true, owner: 'first' },
        }),
        defaultsPlugin('last-defaults', {
          computed: { priority: () => 'last' },
          meta: { owner: 'last' },
        }),
      ],
      remote: false,
    })

    const item = stack.store.items.writeItem({ id: '1' })
    const owned = stack.store.owned.writeItem({ id: '2' })

    expect([item.existing, item.plugin, item.priority]).toEqual(['existing', 'plugin', 'last'])
    expect([owned.existing, owned.plugin, owned.priority]).toEqual(['existing', 'plugin', 'collection'])
    expect(stack.collection('items').meta).toEqual({ initial: true, plugin: true, owner: 'last' })
    expect(stack.collection('owned').meta).toEqual({ initial: true, plugin: true, owner: 'collection' })
  })

  it('applies late key and instance defaults when no defaults object was supplied', async () => {
    const stack = await createVueStack({
      schema: [{ name: 'items' }],
      plugins: [defaultsPlugin('identity-defaults', {
        getKey: (item: any) => item.uuid,
        isInstanceOf: (collection: any) => (item: any) => item.kind === collection.name,
      })],
      remote: false,
    })

    const item = stack.store.items.writeItem({ uuid: 'i1', kind: 'items', title: 'One' })

    expect(item.$getKey()).toBe('i1')
    expect(stack.store.items.peekFirst('i1')).toBe(item)
    expect(stack.store.$getCollection({ kind: 'items' })).toBe(stack.collection('items'))
  })
})
