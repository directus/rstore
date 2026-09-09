import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it } from 'vitest'
import { DEFAULT_USER } from '../../utils/formEditor'

describe('updateForm', () => {
  it('should submit all properties when pickOnlyChanged is false', async () => {
    const { store, remote } = await createVueStack({ schema: [{ name: 'users' }], data: { users: [DEFAULT_USER] } })

    const form = await store.users.updateForm(1, {
      pickOnlyChanged: false,
    })

    // Only change the name
    form.name = 'Jane'
    await form.$submit()

    // All properties should be submitted
    expect(remote.lastRequest('updateItem')!.key).toBe(1)
    expect(remote.lastRequest('updateItem')!.item).toEqual({
      id: 1,
      name: 'Jane',
      email: 'john@example.com',
      age: 30,
    })
    expect(remote.rows('users')).toEqual([{ ...DEFAULT_USER, name: 'Jane' }])
    expect(store.users.peekFirst(1)).toMatchObject({ ...DEFAULT_USER, name: 'Jane' })
  })

  it('should reset form with original default values', async () => {
    const { store, remote } = await createVueStack({ schema: [{ name: 'users' }], data: { users: [DEFAULT_USER] } })

    const form = await store.users.updateForm(1, {
      defaultValues: () => ({
        name: 'Default Name',
      }),
      resetOnSuccess: false,
    })

    expect(form.name).toBe('Default Name')

    form.name = 'Changed Name'
    expect(form.name).toBe('Changed Name')

    await form.$reset()

    // Should reset to the initial default values
    expect(form.name).toBe('Default Name')
    expect(form.email).toBe('john@example.com')
    expect(form.age).toBe(30)
    expect(remote.rows('users')).toEqual([DEFAULT_USER])
    expect(store.users.peekFirst(1)).toMatchObject(DEFAULT_USER)
  })
})
