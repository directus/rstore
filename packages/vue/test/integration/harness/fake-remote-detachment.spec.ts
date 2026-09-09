import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

const wireDate = '2023-01-01T00:00:00.000Z'

/** Nested values expose aliases hidden by scalar-only backend fixtures. */
function row() {
  return { id: '1', metadata: { createdAt: wireDate, tags: ['original'] } }
}

/** Real parsing must change only the client representation. */
const schema = [{
  name: 'events',
  fields: {
    'metadata.createdAt': {
      parse: (value: string) => new Date(value),
      serialize: (value: Date) => value.toISOString(),
    },
  },
}]

describe('fake remote transport detachment', () => {
  it.each(['first', 'many', 'batch'] as const)('keeps nested backend values unchanged after a %s fetch', async (method) => {
    const stack = await createVueStack({ schema, data: { events: [row()] }, batching: true, batch: true })
    const result = method === 'many'
      ? (await stack.store.events.findMany())[0]
      : await stack.store.events.findFirst({ key: '1', batch: method === 'batch' })

    expect(result.metadata.createdAt).toBeInstanceOf(Date)
    expect(stack.remote.rows('events')).toEqual([row()])
  })

  it('detaches seeded data and inspection copies, including mutable supported values', async () => {
    const initial = { ...row(), date: new Date(1000), map: new Map([['key', { value: 1 }]]) }
    const stack = await createVueStack({ schema: [{ name: 'events' }], data: { events: [initial] } })
    initial.metadata.tags.push('outside')
    initial.date.setTime(2000)
    initial.map.get('key')!.value = 2
    const copy = stack.remote.rows('events')[0]!
    expect(copy.metadata.tags).toEqual(['original'])
    expect(copy.date).toEqual(new Date(1000))
    expect(copy.map.get('key')).toEqual({ value: 1 })
    copy.metadata.tags.push('inspection')
    expect(stack.remote.rows('events')[0]!.metadata.tags).toEqual(['original'])

    const seeded = row()
    stack.remote.seed('events', [seeded])
    seeded.metadata.tags.push('after seed')
    expect(stack.remote.rows('events')).toEqual([row()])
  })

  it.each(['create', 'update'] as const)('keeps %s wire payloads and backend rows detached from response parsing', async (method) => {
    const stack = await createVueStack({ schema, data: { events: [row()] } })
    const item = { id: '1', metadata: { createdAt: new Date(wireDate), tags: ['sent'] } }
    const result = await stack.store.events[method](item)
    const expected = { id: '1', metadata: { createdAt: wireDate, tags: ['sent'] } }
    expect(result.metadata.createdAt).toBeInstanceOf(Date)
    expect(stack.remote.rows('events')).toEqual([expected])
    expect(stack.remote.lastRequest(`${method}Item`)!.item).toEqual(expected)
    item.metadata.tags.push('later')
    expect(stack.remote.lastRequest(`${method}Item`)!.item).toEqual(expected)
  })

  it.each([false, true])('executes held fetches with recorded options (custom handler: %s)', async (custom) => {
    const stack = await createVueStack({
      schema: [{ name: 'events' }],
      data: { events: [row()] },
      on: custom ? { fetchMany: ctx => ctx.select(ctx.payload.findOptions) } : undefined,
    })
    const params = { where: { id: '1' } }
    const filter = (item: any) => item.id === '1'
    const release = stack.remote.holdNext('fetchMany')
    onTestFinished(release)
    const pending = stack.store.events.findMany({ params, filter })
    await vi.waitFor(() => expect(stack.remote.callCount('fetchMany')).toBe(1))
    params.where.id = 'other'
    release()
    const result = await pending
    expect(result.map((item: any) => item.id)).toEqual(['1'])
    expect(stack.remote.lastRequest('fetchMany')!.findOptions.params).toEqual({ where: { id: '1' } })
    expect(stack.remote.lastRequest('fetchMany')!.findOptions.filter).toBe(filter)
  })

  it.each([false, true])('executes held mutations with their dispatched payload (batched: %s)', async (batch) => {
    let sent: any
    const stack = await createVueStack({
      schema: [{ name: 'events' }],
      data: { events: [row()] },
      batching: true,
      batch,
      plugins: [{ name: 'observe-payload', setup({ hook }) {
        hook('beforeMutation', ({ item }) => {
          sent = item
        })
      } }],
    })
    const hook = batch ? 'batchMutate' : 'updateItem'
    const release = stack.remote.holdNext(hook)
    onTestFinished(release)
    const pending = stack.store.events.update({ id: '1', metadata: { tags: ['sent'] } }, { batch, optimistic: false })
    await vi.waitFor(() => expect(stack.remote.callCount(hook)).toBe(1))
    // A plugin retaining the hook payload must not mutate an already sent request.
    sent.metadata.tags.push('after dispatch')
    release()
    const result = await pending

    expect(result.metadata.tags).toEqual(['sent'])
    expect(stack.remote.rows('events')[0]!.metadata.tags).toEqual(['sent'])
    const call = stack.remote.lastRequest(hook)!
    expect((batch ? call.items![0] : call.item).metadata.tags).toEqual(['sent'])
  })

  it('detaches custom responses before client parsing touches their fixture', async () => {
    const fixture = row()
    const stack = await createVueStack({ schema, on: { fetchFirst: () => fixture } })
    await stack.store.events.findFirst('1')
    expect(fixture).toEqual(row())
  })
})
