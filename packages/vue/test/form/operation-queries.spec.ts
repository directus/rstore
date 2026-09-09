import { createFormObject } from '@rstore/vue'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

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
