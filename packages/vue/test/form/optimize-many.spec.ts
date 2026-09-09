import { optimizeOpLog } from '@rstore/vue'
import { describe, expect, it } from 'vitest'
import { relationCollection } from '../utils/form'

describe('optimizeOpLog', () => {
  describe('many-relation connect/disconnect', () => {
    const collection = relationCollection()

    it('cancels connect then disconnect of the same item', () => {
      const ops = [
        { timestamp: 1, field: 'posts', type: 'connect' as const, newValue: { id: 'post-1' }, oldValue: undefined },
        { timestamp: 2, field: 'posts', type: 'disconnect' as const, newValue: undefined, oldValue: { id: 'post-1' } },
      ]
      const result = optimizeOpLog(ops, collection)
      expect(result).toHaveLength(0)
    })

    it('cancels disconnect then connect of the same item', () => {
      const ops = [
        { timestamp: 1, field: 'posts', type: 'disconnect' as const, newValue: undefined, oldValue: { id: 'post-1' } },
        { timestamp: 2, field: 'posts', type: 'connect' as const, newValue: { id: 'post-1' }, oldValue: undefined },
      ]
      const result = optimizeOpLog(ops, collection)
      expect(result).toHaveLength(0)
    })

    it('does not cancel connect/disconnect of different items', () => {
      const ops = [
        { timestamp: 1, field: 'posts', type: 'connect' as const, newValue: { id: 'post-1' }, oldValue: undefined },
        { timestamp: 2, field: 'posts', type: 'disconnect' as const, newValue: undefined, oldValue: { id: 'post-2' } },
      ]
      const result = optimizeOpLog(ops, collection)
      expect(result).toHaveLength(2)
    })

    it('cancels selectively when multiple connects and one disconnect', () => {
      const ops = [
        { timestamp: 1, field: 'posts', type: 'connect' as const, newValue: { id: 'post-1' }, oldValue: undefined },
        { timestamp: 2, field: 'posts', type: 'connect' as const, newValue: { id: 'post-2' }, oldValue: undefined },
        { timestamp: 3, field: 'posts', type: 'disconnect' as const, newValue: undefined, oldValue: { id: 'post-1' } },
      ]
      const result = optimizeOpLog(ops, collection)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ type: 'connect', newValue: { id: 'post-2' } })
    })

    it('disconnect-all removes all prior connects', () => {
      const ops = [
        { timestamp: 1, field: 'posts', type: 'connect' as const, newValue: { id: 'post-1' }, oldValue: undefined },
        { timestamp: 2, field: 'posts', type: 'connect' as const, newValue: { id: 'post-2' }, oldValue: undefined },
        { timestamp: 3, field: 'posts', type: 'disconnect' as const, newValue: [], oldValue: [{ id: 'post-1' }, { id: 'post-2' }] },
      ]
      const result = optimizeOpLog(ops, collection)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ type: 'disconnect', newValue: [] })
    })

    it('keeps connects after a disconnect-all', () => {
      const ops = [
        { timestamp: 1, field: 'posts', type: 'connect' as const, newValue: { id: 'post-1' }, oldValue: undefined },
        { timestamp: 2, field: 'posts', type: 'disconnect' as const, newValue: [], oldValue: [{ id: 'post-1' }] },
        { timestamp: 3, field: 'posts', type: 'connect' as const, newValue: { id: 'post-3' }, oldValue: undefined },
      ]
      const result = optimizeOpLog(ops, collection)
      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({ type: 'disconnect', newValue: [] })
      expect(result[1]).toMatchObject({ type: 'connect', newValue: { id: 'post-3' } })
    })

    it('set replaces all prior relation ops', () => {
      const ops = [
        { timestamp: 1, field: 'posts', type: 'connect' as const, newValue: { id: 'post-1' }, oldValue: undefined },
        { timestamp: 2, field: 'posts', type: 'disconnect' as const, newValue: undefined, oldValue: { id: 'post-2' } },
        { timestamp: 3, field: 'posts', type: 'set' as const, newValue: [{ id: 'post-3' }], oldValue: [] },
      ]
      const result = optimizeOpLog(ops, collection)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ type: 'set', newValue: [{ id: 'post-3' }] })
    })
  })
})
