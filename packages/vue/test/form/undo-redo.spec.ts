import { createFormObject } from '@rstore/vue'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

describe('createFormObject - event sourcing', () => {
  it('undo reverts the last field set', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John', age: 30 }),
      submit: async () => {},
    })

    obj.name = 'Jane'
    obj.age = 31

    await nextTick()

    expect(obj.name).toBe('Jane')
    expect(obj.age).toBe(31)
    expect(obj.$opLog.canUndo).toBe(true)

    obj.$opLog.undo()

    await nextTick()

    expect(obj.name).toBe('Jane')
    expect(obj.age).toBe(30)
    expect(obj.$opLog.getAll()).toHaveLength(1)
    expect(obj.$changedProps).toEqual({
      name: ['Jane', 'John'],
    })
  })

  it('undo returns false on empty log', () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John' }),
      submit: async () => {},
    })

    expect(obj.$opLog.canUndo).toBe(false)
    expect(obj.$opLog.undo()).toBe(false)
  })

  it('redo restores the last undone operation', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John' }),
      submit: async () => {},
    })

    obj.name = 'Jane'

    await nextTick()

    obj.$opLog.undo()

    await nextTick()

    expect(obj.name).toBe('John')
    expect(obj.$opLog.canRedo).toBe(true)

    obj.$opLog.redo()

    await nextTick()

    expect(obj.name).toBe('Jane')
    expect(obj.$opLog.getAll()).toHaveLength(1)
    expect(obj.$opLog.canRedo).toBe(false)
  })

  it('redo returns false on empty redo stack', () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John' }),
      submit: async () => {},
    })

    expect(obj.$opLog.canRedo).toBe(false)
    expect(obj.$opLog.redo()).toBe(false)
  })

  it('new operation clears the redo stack', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John' }),
      submit: async () => {},
    })

    obj.name = 'Jane'
    obj.name = 'Bob'

    await nextTick()

    obj.$opLog.undo() // undo Bob -> Jane

    await nextTick()

    expect(obj.name).toBe('Jane')
    expect(obj.$opLog.canRedo).toBe(true)

    // New operation should clear the redo stack
    obj.name = 'Alice'

    await nextTick()

    expect(obj.$opLog.canRedo).toBe(false)
    expect(obj.$opLog.getAll()).toHaveLength(2)
    expect(obj.name).toBe('Alice')
  })

  it('multiple undo/redo round-trips', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John', age: 30 }),
      submit: async () => {},
    })

    obj.name = 'Jane'
    obj.age = 31
    obj.name = 'Bob'

    await nextTick()

    expect(obj.$opLog.getAll()).toHaveLength(3)

    obj.$opLog.undo() // undo Bob
    obj.$opLog.undo() // undo age=31
    obj.$opLog.undo() // undo Jane

    await nextTick()

    expect(obj.name).toBe('John')
    expect(obj.age).toBe(30)
    expect(obj.$opLog.getAll()).toHaveLength(0)
    expect(obj.$hasChanges()).toBe(false)

    obj.$opLog.redo()
    obj.$opLog.redo()
    obj.$opLog.redo()

    await nextTick()

    expect(obj.name).toBe('Bob')
    expect(obj.age).toBe(31)
    expect(obj.$opLog.getAll()).toHaveLength(3)
    expect(obj.$hasChanges()).toBe(true)
  })

  it('stateAt returns state at a specific operation index', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John', age: 30 }),
      submit: async () => {},
    })

    obj.name = 'Jane'
    obj.age = 31
    obj.name = 'Bob'

    await nextTick()

    // Index 0 = initial state
    const s0 = obj.$opLog.stateAt(0)
    expect(s0.name).toBe('John')
    expect(s0.age).toBe(30)

    // Index 1 = after first op (name = Jane)
    const s1 = obj.$opLog.stateAt(1)
    expect(s1.name).toBe('Jane')
    expect(s1.age).toBe(30)

    // Index 2 = after second op (age = 31)
    const s2 = obj.$opLog.stateAt(2)
    expect(s2.name).toBe('Jane')
    expect(s2.age).toBe(31)

    // Index 3 = after all ops (name = Bob)
    const s3 = obj.$opLog.stateAt(3)
    expect(s3.name).toBe('Bob')
    expect(s3.age).toBe(31)

    // Index beyond log length = same as full log
    const sBeyond = obj.$opLog.stateAt(100)
    expect(sBeyond.name).toBe('Bob')
    expect(sBeyond.age).toBe(31)
  })

  it('clear also clears the redo stack', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John' }),
      submit: async () => {},
    })

    obj.name = 'Jane'
    await nextTick()

    obj.$opLog.undo()
    await nextTick()

    expect(obj.$opLog.canRedo).toBe(true)

    obj.$opLog.clear()

    expect(obj.$opLog.canRedo).toBe(false)
    expect(obj.$opLog.canUndo).toBe(false)
  })
})
