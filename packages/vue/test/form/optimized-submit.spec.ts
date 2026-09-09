import { createFormObject } from '@rstore/vue'
import { describe, expect, it } from 'vitest'
import { relationCollection } from '../utils/form'

describe('optimizeOpLog', () => {
  describe('integration with form $submit', () => {
    it('passes optimized ops to submit', async () => {
      const collection = relationCollection()

      let receivedOps: any[] = []
      const obj = createFormObject({
        defaultValues: () => ({ id: 'user-1', name: 'John' }),
        submit: async (_data, { formOperations }) => {
          receivedOps = formOperations
        },
        collection,
        validateOnSubmit: false,
      }) as any

      // Connect and then disconnect the same item → should cancel out
      obj.posts.$connect({ id: 'post-1', title: 'First' })
      obj.posts.$disconnect({ id: 'post-1' })

      await obj.$submit()

      // The connect+disconnect should have been optimized away
      expect(receivedOps.filter((op: any) => op.field === 'posts')).toHaveLength(0)
    })

    it('passes optimized ops keeping non-cancelled operations', async () => {
      const collection = relationCollection()

      let receivedOps: any[] = []
      const obj = createFormObject({
        defaultValues: () => ({ id: 'user-1', name: 'John' }),
        submit: async (_data, { formOperations }) => {
          receivedOps = formOperations
        },
        collection,
        validateOnSubmit: false,
      }) as any

      // Connect two items, disconnect one → only the remaining connect should be in ops
      obj.posts.$connect({ id: 'post-1', title: 'First' })
      obj.posts.$connect({ id: 'post-2', title: 'Second' })
      obj.posts.$disconnect({ id: 'post-1' })

      await obj.$submit()

      const postOps = receivedOps.filter((op: any) => op.field === 'posts')
      expect(postOps).toHaveLength(1)
      expect(postOps[0]).toMatchObject({ type: 'connect', newValue: { id: 'post-2', title: 'Second' } })
    })
  })

  describe('$opLog.getOptimized()', () => {
    it('returns optimized ops without modifying the raw log', () => {
      const collection = relationCollection()

      const obj = createFormObject({
        defaultValues: () => ({ id: 'user-1', name: 'John' }),
        submit: async () => {},
        collection,
      }) as any

      obj.posts.$connect({ id: 'post-1', title: 'First' })
      obj.posts.$connect({ id: 'post-2', title: 'Second' })
      obj.posts.$disconnect({ id: 'post-1' })

      // Raw log still has all 3 operations
      expect(obj.$opLog.getAll()).toHaveLength(3)

      // Optimized log should only have the remaining connect
      const optimized = obj.$opLog.getOptimized()
      expect(optimized).toHaveLength(1)
      expect(optimized[0]).toMatchObject({ type: 'connect', newValue: { id: 'post-2', title: 'Second' } })
    })
  })
})
