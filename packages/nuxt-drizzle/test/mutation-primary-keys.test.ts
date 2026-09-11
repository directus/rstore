import { stripPrimaryKeys } from '@rstore/connector-toolkit'
import SuperJSON from 'superjson'
import { describe, expect, it, vi } from 'vitest'

vi.mock('#build/$rstore-drizzle-config.js', () => ({
  apiPath: '/api',
  dialect: 'sqlite',
  scopeId: 'test-scope',
}))

vi.mock('#imports', () => ({
  useRequestFetch: vi.fn(),
}))

const { installBatchHook } = await import('../src/runtime/plugin/batchHook')
const { installMutationHooks } = await import('../src/runtime/plugin/mutationHooks')

/** Captures hook callbacks so a mutation payload can invoke them directly. */
function createHookCollector() {
  const callbacks = new Map<string, (payload: any) => Promise<void>>()
  return {
    hook(name: string, callback: (payload: any) => Promise<void>) {
      callbacks.set(name, callback)
    },
    async run(name: string, payload: any): Promise<void> {
      await callbacks.get(name)?.(payload)
    },
  }
}

const collection = {
  meta: {
    primaryKeys: ['tenantId', 'id'],
  },
  name: 'Todos',
}

describe('drizzle mutation primary keys', () => {
  it('strips generated update keys without mutating the item', async () => {
    const requestFetch = vi.fn(async () => ({ id: 1, title: 'Updated' }))
    const hooks = createHookCollector()
    const item = { id: 1, tenantId: 'tenant-a', title: 'Updated' }
    const setResult = vi.fn()
    installMutationHooks({ apiPath: '/api', requestFetch } as any, hooks.hook)

    await hooks.run('updateItem', { collection, item, key: 1, setResult })

    expect(requestFetch).toHaveBeenCalledWith('/api/Todos/1', expect.objectContaining({
      body: SuperJSON.stringify({ title: 'Updated' }),
      method: 'PATCH',
    }))
    expect(item).toEqual({ id: 1, tenantId: 'tenant-a', title: 'Updated' })
    expect(setResult).toHaveBeenCalledWith({ id: 1, title: 'Updated' })
  })

  it('strips generated batch update keys and falls back to id', async () => {
    const requestFetch = vi.fn<(url: string, options: { body?: string }) => Promise<string>>().mockResolvedValue(SuperJSON.stringify({
      results: [{ ok: true, result: { id: 1, title: 'Updated' } }],
    }))
    const hooks = createHookCollector()
    const item = { id: 1, tenantId: 'tenant-a', title: 'Updated' }
    const setResult = vi.fn()
    installBatchHook({ apiPath: '/api', requestFetch } as any, hooks.hook)

    await hooks.run('batch', {
      operations: [{ collection, item, key: 1, setResult, type: 'update' }],
    })

    const body = SuperJSON.parse(requestFetch.mock.calls[0]![1].body!) as any
    expect(body.operations[0]).toMatchObject({
      item: { title: 'Updated' },
      key: '1',
      type: 'update',
    })
    expect(item).toEqual({ id: 1, tenantId: 'tenant-a', title: 'Updated' })
    expect(stripPrimaryKeys({ id: 1, title: 'Fallback' }, [])).toEqual({ title: 'Fallback' })
    expect(stripPrimaryKeys({ id: 1, title: 'Fallback' }, undefined)).toEqual({ title: 'Fallback' })
    expect(setResult).toHaveBeenCalledWith({ id: 1, title: 'Updated' })
  })
})
