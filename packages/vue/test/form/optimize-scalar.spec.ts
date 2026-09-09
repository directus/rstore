import { optimizeOpLog } from '@rstore/vue'
import { describe, expect, it } from 'vitest'

describe('optimizeOpLog', () => {
  describe('scalar fields', () => {
    it('keeps only the last set for a scalar field', () => {
      const ops = [
        { timestamp: 1, field: 'name', type: 'set' as const, newValue: 'Jane', oldValue: 'John' },
        { timestamp: 2, field: 'name', type: 'set' as const, newValue: 'Bob', oldValue: 'Jane' },
        { timestamp: 3, field: 'name', type: 'set' as const, newValue: 'Alice', oldValue: 'Bob' },
      ]
      const result = optimizeOpLog(ops)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ field: 'name', newValue: 'Alice' })
    })

    it('keeps last set per field independently', () => {
      const ops = [
        { timestamp: 1, field: 'name', type: 'set' as const, newValue: 'Jane', oldValue: 'John' },
        { timestamp: 2, field: 'age', type: 'set' as const, newValue: 31, oldValue: 30 },
        { timestamp: 3, field: 'name', type: 'set' as const, newValue: 'Bob', oldValue: 'Jane' },
      ]
      const result = optimizeOpLog(ops)
      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({ field: 'age', newValue: 31 })
      expect(result[1]).toMatchObject({ field: 'name', newValue: 'Bob' })
    })
  })
})
