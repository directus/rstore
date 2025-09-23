import { describe, expect, it, vi } from 'vitest'
import { createFormObject } from '../src'

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

    expect(submit).toHaveBeenCalledWith({ name: '' })
  })
})
