import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it } from 'vitest'
import { DEFAULT_USER } from '../../utils/formEditor'

describe('updateForm', () => {
  it('should initialize form with existing item data', async () => {
    const { store } = await createVueStack({ schema: [{ name: 'users' }], data: { users: [DEFAULT_USER] } })

    const form = await store.users.updateForm(1)

    expect(form.name).toBe('John')
    expect(form.email).toBe('john@example.com')
    expect(form.age).toBe(30)
  })

  it('should override item data with default values', async () => {
    const { store } = await createVueStack({ schema: [{ name: 'users' }], data: { users: [DEFAULT_USER] } })

    const form = await store.users.updateForm(1, {
      defaultValues: () => ({
        name: 'Default Name',
        email: 'default@example.com',
      }),
    })

    // Default values should override existing item data
    expect(form.name).toBe('Default Name')
    expect(form.email).toBe('default@example.com')
    // Non-overridden values should remain from the item
    expect(form.age).toBe(30)

    expect(form.$changedProps).toEqual({})

    form.email = 'john@example.com'

    expect(form.$changedProps).toEqual({
      email: ['john@example.com', 'default@example.com'],
    })
  })

  it('should handle default values with undefined properties', async () => {
    const { store } = await createVueStack({ schema: [{ name: 'posts' }], data: { posts: [{
      id: 1,
      title: 'Post Title',
      content: 'Post Content',
      published: true,
    }] } })

    const form = await store.posts.updateForm(1, {
      defaultValues: () => ({
        published: undefined, // Explicitly setting undefined should still override
      }),
    })

    expect(form.title).toBe('Post Title')
    expect(form.content).toBe('Post Content')
    expect(form.published).toBe(undefined)
  })

  it('should throw error when item is not found', async () => {
    const { store } = await createVueStack({ schema: [{ name: 'users' }], data: { users: [] } })

    await expect(store.users.updateForm(999)).rejects.toThrow('Item not found')
  })
})
