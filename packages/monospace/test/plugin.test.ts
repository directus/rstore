import type { PluginSetupApi } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMonospaceRstorePlugin } from '../src'

const client = {
  createMany: vi.fn(),
  createOne: vi.fn(),
  deleteMany: vi.fn(),
  deleteOne: vi.fn(),
  readMany: vi.fn(),
  readOne: vi.fn(),
  updateMany: vi.fn(),
  updateOne: vi.fn(),
}

beforeEach(() => {
  for (const fn of Object.values(client)) {
    fn.mockReset()
  }
})

describe('createMonospaceRstorePlugin', () => {
  it('handles fetches and mutations through the REST client', async () => {
    const hooks = setupPlugin()
    const collection = createCollection()
    client.readOne.mockResolvedValueOnce({ id: 1, title: 'Fetched' })
    client.createOne.mockResolvedValueOnce({ id: 2, title: 'Created' })
    client.updateOne.mockResolvedValueOnce({ id: 1, title: 'Updated' })

    const fetched = await runHook(hooks.fetchFirst, {
      collection,
      key: 1,
    })
    const created = await runHook(hooks.createItem, {
      collection,
      item: { title: 'Created' },
    })
    const updated = await runHook(hooks.updateItem, {
      collection,
      item: { id: 1, title: 'Updated' },
      key: 1,
    })

    expect(fetched).toEqual({ id: 1, title: 'Fetched' })
    expect(created).toEqual({ id: 2, title: 'Created' })
    expect(updated).toEqual({ id: 1, title: 'Updated' })
    expect(client.updateOne).toHaveBeenCalledWith('Todos', 1, { title: 'Updated' }, {})
  })

  it('deletes many items with a primary-key filter', async () => {
    const hooks = setupPlugin()
    const collection = createCollection()
    await hooks.deleteMany({
      abort: vi.fn(),
      collection,
      keys: [1, 2],
    } as any)

    expect(client.deleteMany).toHaveBeenCalledWith('Todos', {
      filter: {
        id: {
          _in: [1, 2],
        },
      },
    })
  })

  it('does not call Monospace when deleteMany receives no keys', async () => {
    const hooks = setupPlugin()
    const abort = vi.fn()
    await hooks.deleteMany({
      abort,
      collection: createCollection(),
      keys: [],
    } as any)

    expect(client.deleteMany).not.toHaveBeenCalled()
    expect(client.deleteOne).not.toHaveBeenCalled()
    expect(abort).toHaveBeenCalled()
  })
})

/**
 * Creates a test plugin and captures registered rstore hooks.
 */
function setupPlugin(): Record<string, any> {
  const hooks: Record<string, any> = {}
  const plugin = createMonospaceRstorePlugin({
    client: client as any,
    scopeId: 'test-scope',
  })
  plugin.setup({
    addCollectionDefaults: vi.fn(),
    hook: vi.fn((name, callback) => {
      hooks[name] = callback
      return vi.fn()
    }),
  } as unknown as PluginSetupApi)
  return hooks
}

/**
 * Runs a data hook and returns the value passed to `setResult`.
 */
async function runHook(callback: any, payload: Record<string, any>): Promise<unknown> {
  let result: unknown
  await callback({
    abort: vi.fn(),
    findOptions: {},
    getResult: () => result,
    setResult: (value: unknown) => {
      result = value
    },
    ...payload,
  })
  return result
}

/**
 * Creates the resolved collection shape used by runtime plugin tests.
 */
function createCollection(): any {
  return {
    name: 'Todos',
    meta: {
      primaryKeys: ['id'],
      monospace: {
        collection: 'Todos',
      },
    },
  }
}
