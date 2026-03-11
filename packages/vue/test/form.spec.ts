import { withItemType } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createFormObject, optimizeOpLog } from '../src'
import { createStore } from '../src/store'

describe('createFormObject', () => {
  it('calls submit', async () => {
    let submittedData: any = null
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John' }),
      submit: async (data) => {
        submittedData = data
      },
    })

    obj.name = 'Jane'
    await obj.$submit()

    expect(submittedData).toEqual({ name: 'Jane' })
  })

  it('auto resets the form', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John' }),
      submit: async () => {
        // Meow
      },
    })

    obj.name = 'Jane'

    await obj.$submit()

    expect(obj.name).toBe('John')
  })

  it('not auto resets the form when `autoReset` is false', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John' }),
      submit: async () => {
        // Meow
      },
      resetOnSuccess: false,
    })

    obj.name = 'Jane'

    await obj.$submit()

    expect(obj.name).toBe('Jane')
  })

  it('validates the form before submit', async () => {
    const submit = vi.fn()
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John' }),
      schema: {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: async (data: any) => {
            const issues = []
            if (!data.name) {
              issues.push({ message: 'Name is required' })
            }
            return { issues: issues.length ? issues : undefined, value: data }
          },
        },
      },
      submit,
    })

    obj.name = ''

    await expect(() => obj.$submit()).rejects.toThrow('Name is required')
    expect(submit).not.toHaveBeenCalled()

    obj.name = 'Jane'

    await obj.$submit()

    expect(submit).toHaveBeenCalled()
  })

  it('does not validate the form before submit when `validateOnSubmit` is false', async () => {
    const submit = vi.fn()
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John' }),
      schema: {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: async (data: any) => {
            const issues = []
            if (!data.name) {
              issues.push({ message: 'Name is required' })
            }
            return { issues: issues.length ? issues : undefined, value: data }
          },
        },
      },
      submit,
      validateOnSubmit: false,
    })

    obj.name = ''

    await obj.$submit()

    expect(submit).toHaveBeenCalledWith({ name: '' }, expect.objectContaining({ formOperations: expect.any(Array) }))
  })
})

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

  it('clears the op log on successful submit when resetOnSuccess is true', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John' }),
      submit: async () => {},
      resetOnSuccess: true,
    })

    obj.name = 'Jane'

    await nextTick()

    expect(obj.$opLog.getAll()).toHaveLength(1)

    await obj.$submit()

    expect(obj.$opLog.getAll()).toHaveLength(0)
    expect(obj.$changedProps).toEqual({})
    expect(obj.$hasChanges()).toBe(false)
  })

  it('does not clear the op log on successful submit when resetOnSuccess is false', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John' }),
      submit: async () => {},
      resetOnSuccess: false,
    })

    obj.name = 'Jane'

    await nextTick()

    expect(obj.$opLog.getAll()).toHaveLength(1)

    await obj.$submit()

    // Op log should still be there
    expect(obj.$opLog.getAll()).toHaveLength(1)
    expect(obj.$hasChanges()).toBe(true)
  })

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

  it('undo/redo with relation connect on one-to-one', async () => {
    const collection: any = {
      name: 'User',
      normalizedRelations: {
        profile: {
          many: false,
          to: [{
            collection: 'Profile',
            on: {
              'Profile.id': 'User.profileId',
            },
          }],
        },
      },
    }

    const obj = createFormObject({
      defaultValues: () => ({ name: 'John', profileId: null as string | null }),
      submit: async () => {},
      collection,
    }) as any

    obj.profile.connect({ id: 'profile-123' })

    await nextTick()

    expect(obj.profileId).toBe('profile-123')

    obj.$opLog.undo()

    await nextTick()

    expect(obj.profileId).toBe(null)

    obj.$opLog.redo()

    await nextTick()

    expect(obj.profileId).toBe('profile-123')
  })

  it('undo/redo with many-relation connect/disconnect', async () => {
    const collection: any = {
      name: 'User',
      normalizedRelations: {
        posts: {
          many: true,
          to: [{
            collection: 'Post',
            on: {
              'Post.authorId': 'User.id',
            },
          }],
        },
      },
    }

    const obj = createFormObject({
      defaultValues: () => ({ id: 'user-1', name: 'John' }),
      submit: async () => {},
      collection,
    }) as any

    obj.posts.connect({ id: 'post-1', title: 'First' })
    obj.posts.connect({ id: 'post-2', title: 'Second' })

    expect(obj._$postsData).toHaveLength(2)

    obj.$opLog.undo() // undo second connect

    await nextTick()

    expect(obj._$postsData).toHaveLength(1)
    expect(obj._$postsData[0]).toEqual({ id: 'post-1', title: 'First' })

    obj.$opLog.undo() // undo first connect

    await nextTick()

    expect(obj._$postsData).toHaveLength(0)

    obj.$opLog.redo() // redo first connect

    await nextTick()

    expect(obj._$postsData).toHaveLength(1)
    expect(obj._$postsData[0]).toEqual({ id: 'post-1', title: 'First' })
  })
})

describe('createFormObject - op log queries', () => {
  it('provides getFieldOps to retrieve operations for a specific field', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John', age: 30, email: 'john@example.com' }),
      submit: async () => {},
    })

    obj.name = 'Jane'
    obj.name = 'Bob'
    obj.age = 31

    await nextTick()

    const nameOps = obj.$opLog.getFieldOps('name')
    expect(nameOps).toHaveLength(2)
    expect(nameOps[0]).toMatchObject({ field: 'name', newValue: 'Jane' })
    expect(nameOps[1]).toMatchObject({ field: 'name', newValue: 'Bob' })

    const ageOps = obj.$opLog.getFieldOps('age')
    expect(ageOps).toHaveLength(1)
    expect(ageOps[0]).toMatchObject({ field: 'age', newValue: 31 })

    const emailOps = obj.$opLog.getFieldOps('email')
    expect(emailOps).toHaveLength(0)
  })

  it('provides getOpsBy to filter operations with a custom predicate', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John', age: 30, email: 'john@example.com' }),
      submit: async () => {},
    })

    obj.name = 'Jane'
    obj.age = 31
    obj.email = 'jane@example.com'
    obj.name = 'Bob'

    await nextTick()

    // Get all operations where newValue is a string with length > 3
    const longStringOps = obj.$opLog.getOpsBy(op => typeof op.newValue === 'string' && op.newValue.length > 3)
    expect(longStringOps).toHaveLength(2)
    expect(longStringOps.map(op => op.field)).toEqual(['name', 'email'])

    // Get all operations where oldValue === newValue (none in this case)
    const unchangedOps = obj.$opLog.getOpsBy(op => op.oldValue === op.newValue)
    expect(unchangedOps).toHaveLength(0)
  })

  it('provides getLastFieldOp to retrieve the most recent operation for a field', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John', age: 30 }),
      submit: async () => {},
    })

    obj.name = 'Jane'
    obj.name = 'Bob'
    obj.name = 'Alice'

    await nextTick()

    const lastNameOp = obj.$opLog.getLastFieldOp('name')
    expect(lastNameOp).toMatchObject({
      field: 'name',
      newValue: 'Alice',
      oldValue: 'Bob',
    })

    // Age hasn't been changed
    const lastAgeOp = obj.$opLog.getLastFieldOp('age')
    expect(lastAgeOp).toBeUndefined()
  })

  it('provides hasFieldChanged to check if a field has been modified', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John', age: 30, email: 'john@example.com' }),
      submit: async () => {},
    })

    expect(obj.$opLog.hasFieldChanged('name')).toBe(false)
    expect(obj.$opLog.hasFieldChanged('age')).toBe(false)
    expect(obj.$opLog.hasFieldChanged('email')).toBe(false)

    obj.name = 'Jane'
    obj.age = 31

    await nextTick()

    expect(obj.$opLog.hasFieldChanged('name')).toBe(true)
    expect(obj.$opLog.hasFieldChanged('age')).toBe(true)
    expect(obj.$opLog.hasFieldChanged('email')).toBe(false)
  })

  it('provides getOpsInRange to retrieve operations within a time range', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ name: 'John', age: 30, email: 'john@example.com' }),
      submit: async () => {},
    })

    const startTime = Date.now()

    obj.name = 'Jane'

    obj.age = 31
    obj.email = 'jane@example.com'
    const endTime = Date.now()

    await nextTick()

    const allOps = obj.$opLog.getOpsInRange(startTime - 1000, endTime + 1000)
    expect(allOps).toHaveLength(3)

    // Since all operations may happen within the same millisecond, check that we get all operations
    const allOpsRelatedCheck = obj.$opLog.getOpsInRange(startTime - 1000, endTime + 1000)
    expect(allOpsRelatedCheck.length).toBeGreaterThanOrEqual(2)

    const emptyOps = obj.$opLog.getOpsInRange(endTime + 1000, endTime + 2000)
    expect(emptyOps).toHaveLength(0)
  })

  it('allows building relational dependencies on field changes', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ firstName: 'John', lastName: 'Doe', fullName: 'John Doe' }),
      submit: async () => {},
    })

    // Helper to update fullName when firstName or lastName changes
    const updateFullName = () => {
      const firstNameOps = obj.$opLog.getFieldOps('firstName')
      const lastNameOps = obj.$opLog.getFieldOps('lastName')

      if (firstNameOps.length > 0 || lastNameOps.length > 0) {
        const lastName = obj.$opLog.getLastFieldOp('lastName')?.newValue ?? obj.lastName
        const firstName = obj.$opLog.getLastFieldOp('firstName')?.newValue ?? obj.firstName
        obj.fullName = `${firstName} ${lastName}`
      }
    }

    obj.firstName = 'Jane'
    await nextTick()
    updateFullName()

    expect(obj.fullName).toBe('Jane Doe')

    obj.lastName = 'Smith'
    await nextTick()
    updateFullName()

    expect(obj.fullName).toBe('Jane Smith')
  })

  it('tracks related field changes for validation or side effects', async () => {
    const onChange = vi.fn()

    const obj = createFormObject({
      defaultValues: () => ({ categoryId: null as number | null, subcategoryId: null as number | null }),
      submit: async () => {},
    })

    obj.$onChange(onChange)

    // When categoryId changes, reset subcategoryId
    const handleCategoryChange = () => {
      const categoryOps = obj.$opLog.getFieldOps('categoryId')
      if (categoryOps.length > 0) {
        const lastOp = obj.$opLog.getLastFieldOp('categoryId')
        if (lastOp && lastOp.newValue !== lastOp.oldValue) {
          // Reset subcategory when category changes
          obj.subcategoryId = null
        }
      }
    }

    obj.categoryId = 1
    await nextTick()
    handleCategoryChange()

    expect(obj.subcategoryId).toBe(null)
    expect(obj.$opLog.hasFieldChanged('categoryId')).toBe(true)

    obj.subcategoryId = 10
    await nextTick()

    expect(obj.$opLog.hasFieldChanged('subcategoryId')).toBe(true)
    // subcategoryId has been set twice: once in handleCategoryChange (to null) and once explicitly (to 10)
    expect(obj.$opLog.getFieldOps('subcategoryId')).toHaveLength(2)
  })

  it('integrates with op log to create audit trail of related changes', async () => {
    const obj = createFormObject({
      defaultValues: () => ({ userId: 1, userName: 'John', userEmail: 'john@example.com' }),
      submit: async () => {},
    })

    obj.userId = 2
    obj.userName = 'Jane'
    obj.userEmail = 'jane@example.com'

    await nextTick()

    const opLog = obj.$opLog.getAll()
    expect(opLog).toHaveLength(3)

    // Verify all user-related ops can be retrieved
    const userRelatedOps = obj.$opLog.getOpsBy(
      op => ['userId', 'userName', 'userEmail'].includes(String(op.field)),
    )
    expect(userRelatedOps).toHaveLength(3)

    // Verify the sequence matches user update
    expect(userRelatedOps[0]!.field).toBe('userId')
    expect(userRelatedOps[0]!.newValue).toBe(2)
    expect(userRelatedOps[1]!.field).toBe('userName')
    expect(userRelatedOps[1]!.newValue).toBe('Jane')
    expect(userRelatedOps[2]!.field).toBe('userEmail')
    expect(userRelatedOps[2]!.newValue).toBe('jane@example.com')
  })
})

describe('createFormObject - relation field methods', () => {
  it('should provide connect method for one-to-one relations', () => {
    const collection: any = {
      name: 'User',
      normalizedRelations: {
        profile: {
          many: false,
          to: [{
            collection: 'Profile',
            on: {
              'Profile.id': 'User.profileId',
            },
          }],
        },
      },
    }

    const obj = createFormObject({
      defaultValues: () => ({ name: 'John', profileId: null as string | null }),
      submit: async () => {},
      collection,
    }) as any

    expect(obj.profile).toBeDefined()
    expect(obj.profile.connect).toBeDefined()
    expect(obj.profile.disconnect).toBeDefined()
    expect(obj.profile.set).toBeDefined()

    obj.profile.connect({ id: 'profile-123' })

    expect(obj.profileId).toBe('profile-123')

    // Op log should record the connect operation
    const opLog = obj.$opLog.getAll()
    expect(opLog).toHaveLength(1)
    expect(opLog[0]).toMatchObject({
      type: 'connect',
      field: 'profile',
      newValue: { id: 'profile-123' },
    })
  })

  it('should provide disconnect method for one-to-one relations', () => {
    const collection: any = {
      name: 'User',
      normalizedRelations: {
        profile: {
          many: false,
          to: [{
            collection: 'Profile',
            on: {
              'Profile.id': 'User.profileId',
            },
          }],
        },
      },
    }

    const obj = createFormObject({
      defaultValues: () => ({ name: 'John', profileId: 'profile-123' }),
      submit: async () => {},
      collection,
    }) as any

    obj.profile.disconnect()

    expect(obj.profileId).toBe(null)

    // Op log should record the disconnect operation
    const opLog = obj.$opLog.getAll()
    expect(opLog).toHaveLength(1)
    expect(opLog[0]).toMatchObject({
      type: 'disconnect',
      field: 'profile',
    })
  })

  it('should provide connect method for one-to-many relations', () => {
    const collection: any = {
      name: 'User',
      normalizedRelations: {
        posts: {
          many: true,
          to: [{
            collection: 'Post',
            on: {
              'Post.authorId': 'User.id',
            },
          }],
        },
      },
    }

    const obj = createFormObject({
      defaultValues: () => ({ id: 'user-1', name: 'John' }),
      submit: async () => {},
      collection,
    }) as any

    obj.posts.connect({ id: 'post-1', title: 'First Post' })
    obj.posts.connect({ id: 'post-2', title: 'Second Post' })

    expect(obj._$postsData).toHaveLength(2)
    expect(obj._$postsData[0]).toEqual({ id: 'post-1', title: 'First Post' })
    expect(obj._$postsData[1]).toEqual({ id: 'post-2', title: 'Second Post' })

    // Op log should record both connect operations
    const opLog = obj.$opLog.getAll()
    expect(opLog).toHaveLength(2)
    expect(opLog[0]).toMatchObject({
      type: 'connect',
      field: 'posts',
      newValue: { id: 'post-1', title: 'First Post' },
    })
    expect(opLog[1]).toMatchObject({
      type: 'connect',
      field: 'posts',
      newValue: { id: 'post-2', title: 'Second Post' },
    })
  })

  it('should provide disconnect method for one-to-many relations', () => {
    const collection: any = {
      name: 'User',
      normalizedRelations: {
        posts: {
          many: true,
          to: [{
            collection: 'Post',
            on: {
              'Post.authorId': 'User.id',
            },
          }],
        },
      },
    }

    const obj = createFormObject({
      defaultValues: () => ({
        id: 'user-1',
        name: 'John',
        posts: [
          { id: 'post-1', title: 'First Post' },
          { id: 'post-2', title: 'Second Post' },
        ] as any[],
      }),
      submit: async () => {},
      collection,
    }) as any

    obj.posts.disconnect({ id: 'post-1' })

    expect(obj._$postsData).toHaveLength(1)
    expect(obj._$postsData[0]).toEqual({ id: 'post-2', title: 'Second Post' })

    obj.posts.disconnect()

    expect(obj._$postsData).toHaveLength(0)

    // Op log should record both disconnect operations
    const opLog = obj.$opLog.getAll()
    expect(opLog).toHaveLength(2)
    expect(opLog[0]).toMatchObject({
      type: 'disconnect',
      field: 'posts',
      oldValue: { id: 'post-1', title: 'First Post' },
    })
    expect(opLog[1]).toMatchObject({
      type: 'disconnect',
      field: 'posts',
    })
  })

  it('should provide set method for one-to-many relations', () => {
    const collection: any = {
      name: 'User',
      normalizedRelations: {
        posts: {
          many: true,
          to: [{
            collection: 'Post',
            on: {
              'Post.authorId': 'User.id',
            },
          }],
        },
      },
    }

    const obj = createFormObject({
      defaultValues: () => ({ id: 'user-1', name: 'John' }),
      submit: async () => {},
      collection,
    }) as any

    obj.posts.set([
      { id: 'post-1', title: 'First Post' },
      { id: 'post-2', title: 'Second Post' },
      { id: 'post-3', title: 'Third Post' },
    ])

    expect(obj._$postsData).toHaveLength(3)
    expect(obj._$postsData[0]).toEqual({ id: 'post-1', title: 'First Post' })
    expect(obj._$postsData[2]).toEqual({ id: 'post-3', title: 'Third Post' })

    // Op log should record the set operation
    const opLog = obj.$opLog.getAll()
    expect(opLog).toHaveLength(1)
    expect(opLog[0]).toMatchObject({
      type: 'set',
      field: 'posts',
      newValue: [
        { id: 'post-1', title: 'First Post' },
        { id: 'post-2', title: 'Second Post' },
        { id: 'post-3', title: 'Third Post' },
      ],
    })
  })

  it('should handle multi-field relations', () => {
    const collection: any = {
      name: 'Thing',
      normalizedRelations: {
        related: {
          many: false,
          to: [{
            collection: 'OtherThing',
            on: {
              'OtherThing.type': 'Thing.relatedType',
              'OtherThing.id': 'Thing.relatedId',
            },
          }],
        },
      },
    }

    const obj = createFormObject({
      defaultValues: () => ({ name: 'Thing', relatedType: null as string | null, relatedId: null as string | null }),
      submit: async () => {},
      collection,
    }) as any

    obj.related.connect({ type: 'TypeA', id: 'item-123' })

    expect(obj.relatedType).toBe('TypeA')
    expect(obj.relatedId).toBe('item-123')

    // Op log should record the connect operation
    const opLog = obj.$opLog.getAll()
    expect(opLog).toHaveLength(1)
    expect(opLog[0]).toMatchObject({
      type: 'connect',
      field: 'related',
      newValue: { type: 'TypeA', id: 'item-123' },
    })
  })
})

describe('createFormObject - relation .value', () => {
  it('should return null value for one-to-one relation with no cached data', async () => {
    const Users = withItemType<{ id: number, name: string, profileId: number | null }>().defineCollection({
      name: 'users',
      relations: {
        profile: { to: { profiles: { on: { id: 'profileId' } } }, many: false },
      },
      hooks: {
        create: async ({ item }) => ({ id: 1, name: 'John', profileId: null, ...item }),
      },
    })
    const Profiles = withItemType<{ id: number, bio: string }>().defineCollection({
      name: 'profiles',
    })

    const store = await createStore({ schema: [Users, Profiles], plugins: [] })
    const form = store.users.createForm({ validateOnSubmit: false }) as any

    expect(form.profile.value).toBe(null)
    expect(form.profile.connect).toBeTypeOf('function')
    expect(form.profile.disconnect).toBeTypeOf('function')
    expect(form.profile.set).toBeTypeOf('function')
  })

  it('should resolve one-to-one relation value from cache after connect', async () => {
    const Users = withItemType<{ id: number, name: string, profileId: number | null }>().defineCollection({
      name: 'users',
      relations: {
        profile: { to: { profiles: { on: { id: 'profileId' } } }, many: false },
      },
      hooks: {
        create: async ({ item }) => ({ id: 1, name: 'John', profileId: null, ...item }),
      },
    })
    const Profiles = withItemType<{ id: number, bio: string }>().defineCollection({
      name: 'profiles',
    })

    const store = await createStore({ schema: [Users, Profiles], plugins: [] })

    // Write a profile to the cache
    store.$cache.writeItem({
      collection: store.$collections.find(c => c.name === 'profiles')!,
      key: 42,
      item: { id: 42, bio: 'Hello world' },
    })

    const form = store.users.createForm({ validateOnSubmit: false }) as any

    // Before connect, value is null
    expect(form.profile.value).toBe(null)

    // Connect the profile
    form.profile.connect({ id: 42 })

    // After connect, FK is set
    expect(form.profileId).toBe(42)

    // value resolves from cache
    expect(form.profile.value).toBeDefined()
    expect(form.profile.value.id).toBe(42)
    expect(form.profile.value.bio).toBe('Hello world')
  })

  it('should return null for one-to-one after disconnect', async () => {
    const Users = withItemType<{ id: number, name: string, profileId: number | null }>().defineCollection({
      name: 'users',
      relations: {
        profile: { to: { profiles: { on: { id: 'profileId' } } }, many: false },
      },
      hooks: {
        create: async ({ item }) => ({ id: 1, name: 'John', profileId: null, ...item }),
      },
    })
    const Profiles = withItemType<{ id: number, bio: string }>().defineCollection({
      name: 'profiles',
    })

    const store = await createStore({ schema: [Users, Profiles], plugins: [] })

    store.$cache.writeItem({
      collection: store.$collections.find(c => c.name === 'profiles')!,
      key: 42,
      item: { id: 42, bio: 'Hello world' },
    })

    const form = store.users.createForm({
      defaultValues: () => ({ profileId: 42 }),
      validateOnSubmit: false,
    }) as any

    // Before disconnect, value resolves from cache
    expect(form.profile.value).toBeDefined()
    expect(form.profile.value.id).toBe(42)

    // Disconnect
    form.profile.disconnect()

    expect(form.profileId).toBe(null)
    expect(form.profile.value).toBe(null)
  })

  it('should return empty array for many relation with no cached data', async () => {
    const Users = withItemType<{ id: number, name: string }>().defineCollection({
      name: 'users',
      relations: {
        posts: { to: { posts: { on: { authorId: 'id' } } }, many: true },
      },
      hooks: {
        create: async ({ item }) => ({ id: 1, name: 'John', ...item }),
      },
    })
    const Posts = withItemType<{ id: number, title: string, authorId: number }>().defineCollection({
      name: 'posts',
    })

    const store = await createStore({ schema: [Users, Posts], plugins: [] })
    const form = store.users.createForm({
      defaultValues: () => ({ id: 1 }),
      validateOnSubmit: false,
    }) as any

    expect(form.posts.value).toEqual([])
    expect(form.posts.connect).toBeTypeOf('function')
    expect(form.posts.disconnect).toBeTypeOf('function')
    expect(form.posts.set).toBeTypeOf('function')
  })

  it('should resolve many relation value from cache', async () => {
    const Users = withItemType<{ id: number, name: string }>().defineCollection({
      name: 'users',
      relations: {
        posts: { to: { posts: { on: { authorId: 'id' } } }, many: true },
      },
      hooks: {
        create: async ({ item }) => ({ id: 1, name: 'John', ...item }),
      },
    })
    const Posts = withItemType<{ id: number, title: string, authorId: number }>().defineCollection({
      name: 'posts',
    })

    const store = await createStore({ schema: [Users, Posts], plugins: [] })
    const postsCollection = store.$collections.find(c => c.name === 'posts')!

    // Write some posts to the cache that belong to user 1
    store.$cache.writeItem({ collection: postsCollection, key: 10, item: { id: 10, title: 'First Post', authorId: 1 } })
    store.$cache.writeItem({ collection: postsCollection, key: 20, item: { id: 20, title: 'Second Post', authorId: 1 } })
    store.$cache.writeItem({ collection: postsCollection, key: 30, item: { id: 30, title: 'Other User Post', authorId: 2 } })

    const form = store.users.createForm({
      defaultValues: () => ({ id: 1 }),
      validateOnSubmit: false,
    }) as any

    // value resolves from cache — only posts with authorId=1
    const posts = form.posts.value
    expect(posts).toHaveLength(2)
    expect(posts[0].id).toBe(10)
    expect(posts[1].id).toBe(20)
  })

  it('should reflect connected items in many relation value', async () => {
    const Users = withItemType<{ id: number, name: string }>().defineCollection({
      name: 'users',
      relations: {
        posts: { to: { posts: { on: { authorId: 'id' } } }, many: true },
      },
      hooks: {
        create: async ({ item }) => ({ id: 1, name: 'John', ...item }),
      },
    })
    const Posts = withItemType<{ id: number, title: string, authorId: number }>().defineCollection({
      name: 'posts',
    })

    const store = await createStore({ schema: [Users, Posts], plugins: [] })
    const postsCollection = store.$collections.find(c => c.name === 'posts')!

    // Write one existing post to cache
    store.$cache.writeItem({ collection: postsCollection, key: 10, item: { id: 10, title: 'Existing Post', authorId: 1 } })

    const form = store.users.createForm({
      defaultValues: () => ({ id: 1 }),
      validateOnSubmit: false,
    }) as any

    // Initially one post from cache
    expect(form.posts.value).toHaveLength(1)

    // Connect a new post
    form.posts.connect({ id: 99, title: 'New Post' })

    // value now includes both cache item and connected item
    const posts = form.posts.value
    expect(posts).toHaveLength(2)
    expect(posts[0].id).toBe(10)
    expect(posts[1].id).toBe(99)
  })

  it('should reflect disconnected items in many relation value', async () => {
    const Users = withItemType<{ id: number, name: string }>().defineCollection({
      name: 'users',
      relations: {
        posts: { to: { posts: { on: { authorId: 'id' } } }, many: true },
      },
      hooks: {
        create: async ({ item }) => ({ id: 1, name: 'John', ...item }),
      },
    })
    const Posts = withItemType<{ id: number, title: string, authorId: number }>().defineCollection({
      name: 'posts',
    })

    const store = await createStore({ schema: [Users, Posts], plugins: [] })
    const postsCollection = store.$collections.find(c => c.name === 'posts')!

    store.$cache.writeItem({ collection: postsCollection, key: 10, item: { id: 10, title: 'First', authorId: 1 } })
    store.$cache.writeItem({ collection: postsCollection, key: 20, item: { id: 20, title: 'Second', authorId: 1 } })

    const form = store.users.createForm({
      defaultValues: () => ({ id: 1 }),
      validateOnSubmit: false,
    }) as any

    expect(form.posts.value).toHaveLength(2)

    // Disconnect first post
    form.posts.disconnect({ id: 10 })

    const posts = form.posts.value
    expect(posts).toHaveLength(1)
    expect(posts[0].id).toBe(20)
  })

  it('should reflect set items in many relation value', async () => {
    const Users = withItemType<{ id: number, name: string }>().defineCollection({
      name: 'users',
      relations: {
        posts: { to: { posts: { on: { authorId: 'id' } } }, many: true },
      },
      hooks: {
        create: async ({ item }) => ({ id: 1, name: 'John', ...item }),
      },
    })
    const Posts = withItemType<{ id: number, title: string, authorId: number }>().defineCollection({
      name: 'posts',
    })

    const store = await createStore({ schema: [Users, Posts], plugins: [] })
    const postsCollection = store.$collections.find(c => c.name === 'posts')!

    // Write a post that will be in cache but overridden by set
    store.$cache.writeItem({ collection: postsCollection, key: 10, item: { id: 10, title: 'Old Post', authorId: 1 } })

    const form = store.users.createForm({
      defaultValues: () => ({ id: 1 }),
      validateOnSubmit: false,
    }) as any

    expect(form.posts.value).toHaveLength(1)

    // Set replaces with new items
    form.posts.set([
      { id: 50, title: 'Replaced A' },
      { id: 60, title: 'Replaced B' },
    ])

    const posts = form.posts.value
    expect(posts).toHaveLength(2)
    expect(posts[0]).toMatchObject({ id: 50, title: 'Replaced A' })
    expect(posts[1]).toMatchObject({ id: 60, title: 'Replaced B' })
  })

  it('should resolve connected items from cache when available', async () => {
    const Users = withItemType<{ id: number, name: string }>().defineCollection({
      name: 'users',
      relations: {
        posts: { to: { posts: { on: { authorId: 'id' } } }, many: true },
      },
      hooks: {
        create: async ({ item }) => ({ id: 1, name: 'John', ...item }),
      },
    })
    const Posts = withItemType<{ id: number, title: string, authorId: number }>().defineCollection({
      name: 'posts',
    })

    const store = await createStore({ schema: [Users, Posts], plugins: [] })
    const postsCollection = store.$collections.find(c => c.name === 'posts')!

    // Write a full post to cache
    store.$cache.writeItem({ collection: postsCollection, key: 99, item: { id: 99, title: 'Full Post', authorId: 5 } })

    const form = store.users.createForm({
      defaultValues: () => ({ id: 1 }),
      validateOnSubmit: false,
    }) as any

    // Connect with partial data — but full item exists in cache
    form.posts.connect({ id: 99 })

    const posts = form.posts.value
    expect(posts).toHaveLength(1)
    // Should resolve to the full cached item
    expect(posts[0].title).toBe('Full Post')
  })
})

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

  describe('many-relation connect/disconnect', () => {
    const collection: any = {
      normalizedRelations: {
        posts: { many: true, to: [{ collection: 'Post', on: { 'Post.authorId': 'User.id' } }] },
      },
    }

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

  describe('one-to-one relation', () => {
    const collection: any = {
      normalizedRelations: {
        profile: { many: false, to: [{ collection: 'Profile', on: { 'Profile.id': 'User.profileId' } }] },
      },
    }

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

  describe('integration with form $submit', () => {
    it('passes optimized ops to submit', async () => {
      const collection: any = {
        name: 'User',
        normalizedRelations: {
          posts: {
            many: true,
            to: [{ collection: 'Post', on: { 'Post.authorId': 'User.id' } }],
          },
        },
      }

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
      obj.posts.connect({ id: 'post-1', title: 'First' })
      obj.posts.disconnect({ id: 'post-1' })

      await obj.$submit()

      // The connect+disconnect should have been optimized away
      expect(receivedOps.filter((op: any) => op.field === 'posts')).toHaveLength(0)
    })

    it('passes optimized ops keeping non-cancelled operations', async () => {
      const collection: any = {
        name: 'User',
        normalizedRelations: {
          posts: {
            many: true,
            to: [{ collection: 'Post', on: { 'Post.authorId': 'User.id' } }],
          },
        },
      }

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
      obj.posts.connect({ id: 'post-1', title: 'First' })
      obj.posts.connect({ id: 'post-2', title: 'Second' })
      obj.posts.disconnect({ id: 'post-1' })

      await obj.$submit()

      const postOps = receivedOps.filter((op: any) => op.field === 'posts')
      expect(postOps).toHaveLength(1)
      expect(postOps[0]).toMatchObject({ type: 'connect', newValue: { id: 'post-2', title: 'Second' } })
    })
  })

  describe('$opLog.getOptimized()', () => {
    it('returns optimized ops without modifying the raw log', () => {
      const collection: any = {
        name: 'User',
        normalizedRelations: {
          posts: {
            many: true,
            to: [{ collection: 'Post', on: { 'Post.authorId': 'User.id' } }],
          },
        },
      }

      const obj = createFormObject({
        defaultValues: () => ({ id: 'user-1', name: 'John' }),
        submit: async () => {},
        collection,
      }) as any

      obj.posts.connect({ id: 'post-1', title: 'First' })
      obj.posts.connect({ id: 'post-2', title: 'Second' })
      obj.posts.disconnect({ id: 'post-1' })

      // Raw log still has all 3 operations
      expect(obj.$opLog.getAll()).toHaveLength(3)

      // Optimized log should only have the remaining connect
      const optimized = obj.$opLog.getOptimized()
      expect(optimized).toHaveLength(1)
      expect(optimized[0]).toMatchObject({ type: 'connect', newValue: { id: 'post-2', title: 'Second' } })
    })
  })
})
