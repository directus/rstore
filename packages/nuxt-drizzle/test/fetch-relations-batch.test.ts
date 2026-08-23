import { describe, expect, it, vi } from 'vitest'
import { installFetchHooks } from '../src/runtime/plugin/fetchHooks'

// `fetchRelations` used to issue one findMany per item per relation target
// (N+1): a 86-card deck with 3 included relations fired ~260 queries, each
// full-scanning the client cache before hitting the network. The hook must
// batch: one inArray query per relation target (chunked), deduped values.

interface TestOptions {
  items: any[]
  include: Record<string, boolean>
  relations: Record<string, any>
  cacheItems?: Record<string, any>
}

function runFetchRelations({ items, include, relations, cacheItems }: TestOptions) {
  const hooks = new Map<string, (payload: any) => Promise<void>>()
  installFetchHooks({} as any, (name: string, fn: any) => hooks.set(name, fn))

  const findManyByCollection = new Map<string, ReturnType<typeof vi.fn>>()
  const store = {
    $cache: {
      readItem: ({ key }: any) => (cacheItems ?? Object.fromEntries(items.filter(item => item != null).map(item => [String(item.id), item])))[String(key)],
    },
    $collection: (name: string) => {
      if (!findManyByCollection.has(name)) {
        findManyByCollection.set(name, vi.fn().mockResolvedValue([]))
      }
      return { findMany: findManyByCollection.get(name)! }
    },
  }

  const payload = {
    store,
    collection: {
      name: 'cards',
      getKey: (item: any) => item?.id,
      normalizedRelations: relations,
    },
    findOptions: { include },
    getResult: () => items,
  }

  return hooks.get('fetchRelations')!(payload).then(() => findManyByCollection)
}

const imagesRelation = {
  images: {
    many: true,
    to: [{ collection: 'cardImages', on: { cardId: 'id' } }],
  },
}

describe('fetchRelations batching', () => {
  it('issues one inArray query per relation target instead of one per item', async () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const calls = await runFetchRelations({ items, include: { images: true }, relations: imagesRelation })

    const findMany = calls.get('cardImages')!
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(findMany.mock.calls[0]![0]).toEqual({
      where: { operator: 'inArray', field: 'cardId', value: [1, 2, 3] },
    })
  })

  it('dedupes join values and skips null ones and missing cache items', async () => {
    const items = [{ id: 1, expansionId: 7 }, { id: 2, expansionId: 7 }, { id: 3, expansionId: null }, { id: 4, expansionId: 9 }]
    const calls = await runFetchRelations({
      items,
      include: { expansion: true },
      relations: {
        expansion: { many: false, to: [{ collection: 'cardExpansions', on: { id: 'expansionId' } }] },
      },
      // id 4 is not in the cache: its join value must not be queried.
      cacheItems: { 1: items[0], 2: items[1], 3: items[2] },
    })

    const findMany = calls.get('cardExpansions')!
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(findMany.mock.calls[0]![0]).toEqual({
      where: { operator: 'eq', field: 'id', value: 7 },
    })
  })

  it('chunks large value sets to stay under SQL bind-variable limits', async () => {
    const items = Array.from({ length: 120 }, (_, i) => ({ id: i + 1 }))
    const calls = await runFetchRelations({ items, include: { images: true }, relations: imagesRelation })

    const findMany = calls.get('cardImages')!
    expect(findMany).toHaveBeenCalledTimes(3)
    const sizes = findMany.mock.calls.map((call: any[]) => call[0].where.value.length)
    expect(sizes).toEqual([50, 50, 20])
  })

  it('batches composite join keys as or(and(eq...)) tuples with dedup', async () => {
    const items = [
      { id: 1, setCode: 'SOR', num: 5 },
      { id: 2, setCode: 'SOR', num: 5 },
      { id: 3, setCode: 'SHD', num: 9 },
      { id: 4, setCode: 'SHD', num: null },
    ]
    const calls = await runFetchRelations({
      items,
      include: { printing: true },
      relations: {
        printing: { many: false, to: [{ collection: 'printings', on: { set: 'setCode', number: 'num' } }] },
      },
    })

    const findMany = calls.get('printings')!
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(findMany.mock.calls[0]![0]).toEqual({
      where: {
        operator: 'or',
        conditions: [
          { operator: 'and', conditions: [
            { operator: 'eq', field: 'set', value: 'SOR' },
            { operator: 'eq', field: 'number', value: 5 },
          ] },
          { operator: 'and', conditions: [
            { operator: 'eq', field: 'set', value: 'SHD' },
            { operator: 'eq', field: 'number', value: 9 },
          ] },
        ],
      },
    })
  })

  it('ignores null results and disabled includes, throws on unknown relations', async () => {
    const calls = await runFetchRelations({
      items: [null, { id: 1 }],
      include: { images: false },
      relations: imagesRelation,
    })
    expect(calls.size).toBe(0)

    await expect(runFetchRelations({
      items: [{ id: 1 }],
      include: { nope: true },
      relations: imagesRelation,
    })).rejects.toThrow('Relation "nope" does not exist')
  })
})
