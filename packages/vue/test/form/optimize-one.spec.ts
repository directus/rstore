import { optimizeOpLog } from '@rstore/vue'
import { describe, expect, it } from 'vitest'
import { relationCollection } from '../utils/form'

describe('optimizeOpLog', () => {
  describe('one-to-one relation', () => {
    const collection = relationCollection()

    it('cancels connect then disconnect on one-to-one', () => {
      const ops = [
        { timestamp: 1, field: 'profile', type: 'connect' as const, newValue: { id: 'profile-1' }, oldValue: undefined },
        { timestamp: 2, field: 'profile', type: 'disconnect' as const, newValue: undefined, oldValue: undefined },
      ]
      const result = optimizeOpLog(ops, collection)
      expect(result).toHaveLength(0)
    })

    it('keeps only the last connect for one-to-one', () => {
      const ops = [
        { timestamp: 1, field: 'profile', type: 'connect' as const, newValue: { id: 'profile-1' }, oldValue: undefined },
        { timestamp: 2, field: 'profile', type: 'connect' as const, newValue: { id: 'profile-2' }, oldValue: undefined },
      ]
      const result = optimizeOpLog(ops, collection)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ newValue: { id: 'profile-2' } })
    })

    it('keeps disconnect then connect on one-to-one (replace)', () => {
      const ops = [
        { timestamp: 1, field: 'profile', type: 'disconnect' as const, newValue: undefined, oldValue: undefined },
        { timestamp: 2, field: 'profile', type: 'connect' as const, newValue: { id: 'profile-2' }, oldValue: undefined },
      ]
      const result = optimizeOpLog(ops, collection)
      // disconnect cancels with connect → just connect remains
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ type: 'connect', newValue: { id: 'profile-2' } })
    })
  })
})
