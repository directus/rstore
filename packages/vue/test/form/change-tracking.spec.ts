import { createFormObject } from '@rstore/vue'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

describe('createFormObject - operation log', () => {
  it('records operations in the op log', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John', age: 30 }),
      submit: async () => {},
    })

    obj.name = 'Jane'
    obj.age = 31

    await nextTick()

    const opLog = obj.$opLog.getAll()
    expect(opLog).toHaveLength(2)
    expect(opLog[0]).toMatchObject({
      field: 'name',
      type: 'set',
      newValue: 'Jane',
      oldValue: 'John',
    })
    expect(opLog[0]!.timestamp).toBeTypeOf('number')
    expect(opLog[1]).toMatchObject({
      field: 'age',
      type: 'set',
      newValue: 31,
      oldValue: 30,
    })
    expect(opLog[1]!.timestamp).toBeTypeOf('number')
  })

  it('records multiple changes to the same field', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John' }),
      submit: async () => {},
    })

    obj.name = 'Jane'
    obj.name = 'Bob'
    obj.name = 'Alice'

    await nextTick()

    const opLog = obj.$opLog.getAll()
    expect(opLog).toHaveLength(3)
    expect(opLog[0]).toMatchObject({
      field: 'name',
      type: 'set',
      newValue: 'Jane',
      oldValue: 'John',
    })
    expect(opLog[1]).toMatchObject({
      field: 'name',
      type: 'set',
      newValue: 'Bob',
      oldValue: 'Jane',
    })
    expect(opLog[2]).toMatchObject({
      field: 'name',
      type: 'set',
      newValue: 'Alice',
      oldValue: 'Bob',
    })
  })

  it('computes $changedProps from op log', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John', age: 30 }),
      submit: async () => {},
    })

    obj.name = 'Jane'
    obj.age = 31

    await nextTick()

    expect(obj.$changedProps).toEqual({
      name: ['Jane', 'John'],
      age: [31, 30],
    })
    expect(obj.$hasChanges()).toBe(true)
  })

  it('reports undefined initial values for newly assigned fields', async () => {
    const obj = createFormObject<{ name: string, age?: number }>({
      defaultValues: () => ({ name: 'John' }),
      submit: async data => ({ name: data.name!, age: data.age }),
    })

    obj.age = 31
    await nextTick()

    expect(obj.$changedProps.age).toEqual([31, undefined])
  })

  it('handles reverting a field back to initial value', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John' }),
      submit: async () => {},
    })

    obj.name = 'Jane'
    await nextTick()

    expect(obj.$changedProps).toEqual({
      name: ['Jane', 'John'],
    })

    obj.name = 'John'
    await nextTick()

    // Op log should still contain both operations
    const opLog = obj.$opLog.getAll()
    expect(opLog).toHaveLength(2)

    // But $changedProps should be empty since we're back to initial
    expect(obj.$changedProps).toEqual({})
    expect(obj.$hasChanges()).toBe(false)
  })

  it('clears the op log', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John', age: 30 }),
      submit: async () => {},
    })

    obj.name = 'Jane'
    obj.age = 31

    await nextTick()

    expect(obj.$opLog.getAll()).toHaveLength(2)
    expect(obj.$hasChanges()).toBe(true)

    obj.$opLog.clear()

    expect(obj.$opLog.getAll()).toHaveLength(0)
    expect(obj.$changedProps).toEqual({})
    expect(obj.$hasChanges()).toBe(false)
  })

  it('clears the op log on reset', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John', age: 30 }),
      submit: async () => {},
    })

    obj.name = 'Jane'
    obj.age = 31

    await nextTick()

    expect(obj.$opLog.getAll()).toHaveLength(2)

    await obj.$reset()

    expect(obj.$opLog.getAll()).toHaveLength(0)
    expect(obj.$changedProps).toEqual({})
    expect(obj.$hasChanges()).toBe(false)
    expect(obj.name).toBe('John')
    expect(obj.age).toBe(30)
  })
})
