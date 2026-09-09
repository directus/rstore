import { createDeferred } from '#test-utils/deferred'
import { createFormObject } from '@rstore/vue'
import { describe, expect, it, onTestFinished } from 'vitest'
import { nextTick } from 'vue'

/** Two-field form whose submit is held until the returned gate resolves. */
function createHeldSubmitForm() {
  const gate = createDeferred<void>()
  onTestFinished(() => gate.resolve())
  const saved = { name: 'John', age: 1 }
  const form = createFormObject({
    defaultValues: () => ({ ...saved }),
    submit: async (data) => {
      await gate.promise
      Object.assign(saved, data)
    },
  })
  return { form, gate, saved }
}

describe('createFormObject - operation log', () => {
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

  it('preserves edits made while resetOnSuccess submit is pending', async () => {
    let persistedName = 'John'
    let resolveSubmit!: () => void

    const obj = createFormObject({
      defaultValues: () => ({ name: persistedName }),
      resetDefaultValues: async () => ({ name: persistedName }),
      submit: async (data) => {
        persistedName = data.name!
        await new Promise<void>((resolve) => {
          resolveSubmit = resolve
        })
      },
      resetOnSuccess: true,
    })

    obj.name = 'Jane'

    const submitPromise = obj.$submit()

    obj.name = 'Janet'
    await nextTick()

    resolveSubmit()
    await submitPromise

    expect(obj.name).toBe('Janet')
    expect(obj.$changedProps).toEqual({
      name: ['Janet', 'Jane'],
    })
    expect(obj.$hasChanges()).toBe(true)
    expect(obj.$opLog.getOptimized()).toEqual([
      expect.objectContaining({
        field: 'name',
        type: 'set',
        newValue: 'Janet',
        oldValue: 'Jane',
      }),
    ])
  })

  it('keeps an undo made during a pending submit after editing another field', async () => {
    const { form, gate, saved } = createHeldSubmitForm()
    form.name = 'Jane'
    const pending = form.$submit()
    await nextTick()

    expect(form.$opLog.undo()).toBe(true)
    expect(form.name).toBe('John')
    form.age = 2

    gate.resolve()
    await pending

    expect(form.name).toBe('John')
    expect(form.age).toBe(2)
    expect(form.$changedProps).toEqual({ name: ['John', 'Jane'], age: [2, 1] })
    await form.$submit()
    expect(saved).toEqual({ name: 'John', age: 2 })
    expect(form.$hasChanges()).toBe(false)
  })

  it.each(['reset', 'clear'] as const)('drops an undone submitted edit after an explicit %s', async (action) => {
    const { form, gate } = createHeldSubmitForm()
    form.name = 'Jane'
    const pending = form.$submit()
    await nextTick()

    expect(form.$opLog.undo()).toBe(true)
    if (action === 'reset')
      await form.$reset()
    else
      form.$opLog.clear()
    form.age = 2

    gate.resolve()
    await pending

    // The explicit control drops the undo intent, so the submitted value stays.
    expect(form.name).toBe('Jane')
    expect(form.age).toBe(2)
    expect(form.$changedProps).toEqual({ age: [2, 1] })
  })

  it('submits data and form operations from the same pre-validation snapshot', async () => {
    let resolveValidation!: () => void
    let submittedData: any = null
    let submittedOps: any[] = []

    const obj = createFormObject({
      defaultValues: () => ({ name: 'John' }),
      schema: {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: async (data: any) => {
            await new Promise<void>((resolve) => {
              resolveValidation = resolve
            })
            return { value: data }
          },
        },
      },
      submit: async (data, { formOperations }) => {
        submittedData = data
        submittedOps = formOperations
      },
      resetOnSuccess: false,
    })

    obj.name = 'Jane'

    const submitPromise = obj.$submit()

    obj.name = 'Janet'
    resolveValidation()
    await submitPromise

    expect(submittedData).toEqual({ name: 'Jane' })
    expect(submittedOps).toEqual([
      expect.objectContaining({
        field: 'name',
        type: 'set',
        newValue: 'Jane',
        oldValue: 'John',
      }),
    ])
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
})
