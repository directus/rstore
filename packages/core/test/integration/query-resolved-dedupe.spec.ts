import type { CustomHookMeta } from '@rstore/shared'
import { createDeferred } from '#test-utils/deferred'
import { createCoreStack } from '#test-utils/store/coreStack'
import { findFirst, findMany } from '@rstore/core'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

describe.each(['first', 'many'] as const)('%s resolved request dedupe', (method) => {
  it('separates resolved params while sharing identical resolved requests', async () => {
    const gate = createDeferred<void>()
    onTestFinished(() => gate.resolve())
    const hook = method === 'first' ? 'fetchFirst' : 'fetchMany'
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      on: { [hook]: async (ctx: any) => {
        await gate.promise
        const row = { id: ctx.payload.findOptions.params.tenant }
        return method === 'first' ? row : [row]
      } },
      plugins: [{
        name: 'resolve-tenant',
        setup({ hook }) {
          hook('resolveFindOptions', ({ meta, updateFindOptions }: any) => {
            updateFindOptions({ params: { tenant: meta.tenant } })
          })
        },
      }],
    })
    /** Metadata is independent per consumer, even when the response is shared. */
    const request = (tenant: string) => {
      const meta: CustomHookMeta & { tenant: string } = { tenant }
      const options = {
        store: stack.store,
        collection: stack.collection('todos'),
        meta,
        findOptions: { fetchPolicy: 'fetch-only' as const },
      }
      return method === 'first' ? findFirst(options) : findMany(options)
    }
    const pending = [request('alpha'), request('beta'), request('alpha')]
    try {
      await vi.waitFor(() => expect(stack.remote.callCount(hook)).toBe(2))
    }
    finally {
      gate.resolve()
    }
    const results = await Promise.all(pending)
    expect(results.map(({ result }) => Array.isArray(result) ? result[0]?.id : result?.id)).toEqual(['alpha', 'beta', 'alpha'])
    expect(stack.readMany('todos').map(item => item.id).sort()).toEqual(['alpha', 'beta'])
    await request('beta')
    expect(stack.remote.callCount(hook)).toBe(3)
  })
})
