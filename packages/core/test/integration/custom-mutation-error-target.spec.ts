import type { CollectionDefaults, HookDefinitions, StoreSchema } from '@rstore/shared'
import { createCoreStack } from '#test-utils/store/coreStack'
import { mutate } from '@rstore/core'
import { describe, expect, it } from 'vitest'

/** Public custom mutation error observation. */
type MutationError = Parameters<HookDefinitions<StoreSchema, CollectionDefaults>['mutationError']>[0]

// Real mutate lifecycle/cache; custom callback is external work and rejects.
// Error must identify actual callback target, including before-hook changes.
describe('custom mutation error targets', () => {
  it.each([false, true])('reports inferred execution key after rejection (rewrite: %s)', async (rewrite) => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const failure = new Error('custom remote refused')
    const errors: MutationError[] = []
    const meta = {}
    stack.store.$hooks.hook('beforeMutation', (payload) => {
      if (rewrite)
        payload.setItem({ ...payload.item, id: 'rewritten' })
    })
    stack.store.$hooks.hook('mutationError', (payload) => {
      errors.push(payload)
    })
    await expect(mutate(stack.store, { collection: stack.collection('todos'), mutation: 'update', item: { id: 'inferred' }, meta }, async (context) => {
      expect(context.key).toBe(rewrite ? 'rewritten' : 'inferred')
      throw failure
    })).rejects.toBe(failure)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ error: failure, mutation: 'update', many: false, key: rewrite ? 'rewritten' : 'inferred' })
    expect(errors[0]!.meta).toBe(meta)
    expect(stack.store.$mutationHistory).toEqual([])
    expect(stack.read('todos', 'inferred')).toBeUndefined()
    expect(stack.read('todos', 'rewritten')).toBeUndefined()
  })
})
