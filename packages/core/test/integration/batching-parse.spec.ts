import { createCoreStack } from '#test-utils/store/coreStack'
import { createItem, updateItem } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'

/** Builds an events stack whose parser exposes duplicate parsing. */
async function setup(batch: boolean) {
  const parse = vi.fn((value: string) => value.split(','))
  const stack = await createCoreStack({
    schema: [{
      name: 'events',
      fields: {
        tags: {
          parse,
          serialize: (value: string[]) => value.join(','),
        },
      },
    }],
    data: { events: [{ id: '1', tags: 'old' }] },
    batch: batch ? ['batchMutate'] : false,
    batching: true,
  })
  return { parse, stack }
}

describe('batched mutation parsing', () => {
  it('parses a batched create response once', async () => {
    const { parse, stack } = await setup(true)

    const result = await createItem({
      store: stack.store,
      collection: stack.collection('events'),
      item: { id: '2', tags: ['new'] } as any,
      optimistic: false,
    })

    expect(result.tags).toEqual(['new'])
    expect(stack.read('events', '2')?.tags).toEqual(['new'])
    expect(parse).toHaveBeenCalledOnce()
  })

  it('parses a batched update response once', async () => {
    const { parse, stack } = await setup(true)

    const result = await updateItem({
      store: stack.store,
      collection: stack.collection('events'),
      key: '1',
      item: { tags: ['updated'] } as any,
      optimistic: false,
    })

    expect(result.tags).toEqual(['updated'])
    expect(stack.read('events', '1')?.tags).toEqual(['updated'])
    expect(parse).toHaveBeenCalledOnce()
  })

  it('parses a mutation that falls through to its individual hook once', async () => {
    const { parse, stack } = await setup(false)

    const result = await createItem({
      store: stack.store,
      collection: stack.collection('events'),
      item: { id: '2', tags: ['fallback'] } as any,
      optimistic: false,
    })

    expect(result.tags).toEqual(['fallback'])
    expect(stack.remote.callCount('createItem', 'events')).toBe(1)
    expect(parse).toHaveBeenCalledOnce()
  })
})
