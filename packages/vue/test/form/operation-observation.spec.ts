import { createFormObject } from '@rstore/vue'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

describe('createFormObject - operation log', () => {
  it('preserves op log operations order', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John', age: 30, email: 'john@example.com' }),
      submit: async () => {},
    })

    const timestampBefore = Date.now()

    obj.name = 'Jane'
    obj.age = 31
    obj.email = 'jane@example.com'
    obj.name = 'Bob'

    await nextTick()

    const opLog = obj.$opLog.getAll()
    expect(opLog).toHaveLength(4)

    // Verify operations are in order
    expect(opLog[0]!.field).toBe('name')
    expect(opLog[0]!.newValue).toBe('Jane')

    expect(opLog[1]!.field).toBe('age')
    expect(opLog[1]!.newValue).toBe(31)

    expect(opLog[2]!.field).toBe('email')
    expect(opLog[2]!.newValue).toBe('jane@example.com')

    expect(opLog[3]!.field).toBe('name')
    expect(opLog[3]!.newValue).toBe('Bob')

    // Verify timestamps are in ascending order
    expect(opLog[0]!.timestamp).toBeGreaterThanOrEqual(timestampBefore)
    expect(opLog[1]!.timestamp).toBeGreaterThanOrEqual(opLog[0]!.timestamp)
    expect(opLog[2]!.timestamp).toBeGreaterThanOrEqual(opLog[1]!.timestamp)
    expect(opLog[3]!.timestamp).toBeGreaterThanOrEqual(opLog[2]!.timestamp)
  })

  it('returns a copy of the op log (not the original array)', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John' }),
      submit: async () => {},
    })

    obj.name = 'Jane'

    await nextTick()

    const opLog1 = obj.$opLog.getAll()
    const opLog2 = obj.$opLog.getAll()

    // Should be different arrays
    expect(opLog1).not.toBe(opLog2)

    // But with the same content
    expect(opLog1).toEqual(opLog2)

    // Modifying the returned array should not affect the internal log
    opLog1.push({
      timestamp: Date.now(),
      type: 'set',
      field: 'name',
      newValue: 'Modified',
      oldValue: 'Jane',
    })

    const opLog3 = obj.$opLog.getAll()
    expect(opLog3).toHaveLength(1)
  })

  it('triggers onChange event with changes', async () => {
    const onChange = vi.fn()

    const obj = createFormObject({
      defaultValues: () => ({ name: 'John', age: 30 }),
      submit: async () => {},
    })

    obj.$onChange(onChange)

    obj.name = 'Jane'
    obj.age = 31

    await nextTick()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({
      name: ['Jane', 'John'],
      age: [31, 30],
    })
  })
})
