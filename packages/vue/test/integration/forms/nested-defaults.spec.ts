import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it } from 'vitest'

describe('updateForm', () => {
  it('should handle nested object default values', async () => {
    const { store } = await createVueStack({ schema: [{ name: 'profiles' }], data: { profiles: [{
      id: 1,
      user: {
        name: 'John',
        settings: {
          theme: 'dark',
          notifications: true,
        },
      },
    }] } })

    const form = await store.profiles.updateForm(1, {
      defaultValues: () => ({
        user: {
          name: 'Override Name',
          settings: {
            theme: 'light',
            notifications: false,
          },
        },
      }),
    })

    // Nested default values should override
    expect(form.user).toEqual({
      name: 'Override Name',
      settings: {
        theme: 'light',
        notifications: false,
      },
    })
  })

  it('should handle array default values', async () => {
    const { store } = await createVueStack({ schema: [{ name: 'articles' }], data: { articles: [{
      id: 1,
      title: 'Article Title',
      tags: ['original', 'tags'],
    }] } })

    const form = await store.articles.updateForm(1, {
      defaultValues: () => ({
        tags: ['new', 'default', 'tags'],
      }),
    })

    expect(form.title).toBe('Article Title')
    expect(form.tags).toEqual(['new', 'default', 'tags'])
  })

  it('should handle empty default values function', async () => {
    const { store } = await createVueStack({ schema: [{ name: 'users' }], data: { users: [{
      id: 1,
      name: 'John',
      email: 'john@example.com',
    }] } })

    const form = await store.users.updateForm(1, {
      defaultValues: () => ({}),
    })

    // Should use item data when default values is empty
    expect(form.name).toBe('John')
    expect(form.email).toBe('john@example.com')
  })
})
