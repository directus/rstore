import { describe, expect, it } from 'vitest'
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
})
