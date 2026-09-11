import { createCoreStack } from '#test-utils/store/coreStack'
import { createItem, updateItem } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'

describe('single mutation hook state', () => {
  it.each(['create', 'update'] as const)('keeps %s hook transport identity separate from optimistic application values', async (mutation) => {
    const startsAt = new Date('2026-09-11T10:00:00.000Z')
    const parse = vi.fn((value: string) => new Date(value))
    let firstHookItem: any
    let secondHookItem: any
    let remoteHookItem: any
    const stack = await createCoreStack({
      schema: [{
        name: 'events',
        fields: {
          startsAt: {
            parse,
            serialize: (value: Date) => value.toISOString(),
          },
        },
      }],
      data: mutation === 'update'
        ? { events: [{ id: '1', title: 'Stored', startsAt: startsAt.toISOString() }] }
        : undefined,
      plugins: [
        {
          name: 'replace-mutation-item',
          setup({ hook }: any) {
            hook('beforeMutation', ({ item, modifyItem, setItem }: any) => {
              firstHookItem = item
              modifyItem('title', 'Modified')
              setItem({ ...item, title: 'Replaced' })
            })
          },
        },
        {
          name: 'observe-mutation-item',
          setup({ hook }: any) {
            hook('beforeMutation', ({ item }: any) => {
              secondHookItem = item
            })
          },
        },
        {
          name: 'observe-remote-item',
          before: { plugins: ['fake-remote'] },
          setup({ hook }: any) {
            hook('createItem', ({ item }: any) => {
              remoteHookItem = item
            })
            hook('updateItem', ({ item }: any) => {
              remoteHookItem = item
            })
          },
        },
      ],
    })
    const remoteHook = mutation === 'create' ? 'createItem' : 'updateItem'
    const release = stack.remote.holdNext(remoteHook)
    const options = {
      store: stack.store,
      collection: stack.collection('events'),
      item: { id: '1', title: 'Original', startsAt } as any,
    }
    const pending = mutation === 'create'
      ? createItem(options)
      : updateItem({ ...options, key: '1' })

    await vi.waitFor(() => expect(stack.remote.callCount(remoteHook)).toBe(1))

    const transportItem = stack.remote.lastRequest(remoteHook)!.item
    expect(secondHookItem).toBe(firstHookItem)
    expect(remoteHookItem).toBe(firstHookItem)
    expect(transportItem).toEqual({
      id: '1',
      title: 'Replaced',
      startsAt: startsAt.toISOString(),
    })
    // The live optimistic layer must keep application values while hooks and
    // transport receive serialized wire values through that same object.
    expect(stack.read('events', '1')).toMatchObject({
      id: '1',
      title: 'Replaced',
      startsAt,
    })
    expect(parse).not.toHaveBeenCalled()

    release()
    const result = await pending

    expect(result).toMatchObject({ id: '1', title: 'Replaced', startsAt })
    expect(parse).toHaveBeenCalledTimes(1)
  })
})
