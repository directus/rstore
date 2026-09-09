import { createFormObject, createFormObjectWithChangeDetection } from '@rstore/vue'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

describe('createFormObject', () => {
  it('keeps deprecated form creation, save, and success-listener aliases usable', async () => {
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
    onTestFinished(() => warnings.mockRestore())
    const form = createFormObjectWithChangeDetection({
      defaultValues: () => ({ name: 'Draft' }),
      submit: async data => ({ ...data, name: 'Stored' }),
    })
    const saved = vi.fn()
    const { off } = form.$onSaved(saved)
    form.name = 'Edited'
    expect(await form.$save()).toEqual({ name: 'Stored' })
    expect(saved).toHaveBeenCalledExactlyOnceWith({ name: 'Stored' })
    off()
    await form.$submit()
    expect(saved).toHaveBeenCalledTimes(1)
    expect(warnings.mock.calls.map(([message]) => message)).toEqual([
      'createFormObjectWithChangeDetection is deprecated, use createFormObject instead',
      '$onSaved() is deprecated, use $onSuccess() instead',
      '$save() is deprecated, use $submit() instead',
    ])
  })

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
