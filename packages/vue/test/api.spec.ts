import { withItemType } from '@rstore/core'
import { describe, expect, it } from 'vitest'
import { createStore } from '../src/store'

describe('updateForm', () => {
  it('should initialize form with existing item data', async () => {
    const Users = withItemType<{
      id: number
      name: string
      email: string
      age: number
    }>().defineCollection({
      name: 'users',
      hooks: {
        fetchFirst: () => ({
          id: 1,
          name: 'John',
          email: 'john@example.com',
          age: 30,
        }),
        update: async ({ key, item }) => {
          if (typeof key === 'string') {
            throw new TypeError('Key should be a number')
          }
          return { id: key, name: 'John', email: 'john@example.com', age: 30, ...item }
        },
      },
    })

    const store = await createStore({
      schema: [Users],
      plugins: [],
    })

    const form = await store.users.updateForm(1)

    expect(form.name).toBe('John')
    expect(form.email).toBe('john@example.com')
    expect(form.age).toBe(30)
  })

  it('should override item data with default values', async () => {
    const Users = withItemType<{
      id: number
      name: string
      email: string
      age: number
    }>().defineCollection({
      name: 'users',
      hooks: {
        fetchFirst: () => ({
          id: 1,
          name: 'John',
          email: 'john@example.com',
          age: 30,
        }),
        update: async ({ key, item }) => {
          if (typeof key === 'string') {
            throw new TypeError('Key should be a number')
          }
          return { id: key, name: 'John', email: 'john@example.com', age: 30, ...item }
        },
      },
    })

    const store = await createStore({
      schema: [Users],
      plugins: [],
    })

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
    const Posts = withItemType<{
      id: number
      title: string
      content: string
      published: boolean | undefined
    }>().defineCollection({
      name: 'posts',
      hooks: {
        fetchFirst: () => ({
          id: 1,
          title: 'Post Title',
          content: 'Post Content',
          published: true,
        }),
        update: async ({ key, item }) => {
          if (typeof key === 'string') {
            throw new TypeError('Key should be a number')
          }
          return { id: key, title: 'Post Title', content: 'Post Content', published: true, ...item }
        },
      },
    })

    const store = await createStore({
      schema: [Posts],
      plugins: [],
    })

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
    const Users = withItemType<{
      id: number
      name: string
    }>().defineCollection({
      name: 'users',
      hooks: {
        fetchFirst: () => null,
        update: async ({ key, item }) => {
          if (typeof key === 'string') {
            throw new TypeError('Key should be a number')
          }
          return { id: key, name: '', ...item }
        },
      },
    })

    const store = await createStore({
      schema: [Users],
      plugins: [],
    })

    await expect(store.users.updateForm(999)).rejects.toThrow('Item not found')
  })

  it('should submit only changed properties by default', async () => {
    let submittedData: any = null

    const Users = withItemType<{
      id: number
      name: string
      email: string
      age: number
    }>().defineCollection({
      name: 'users',
      hooks: {
        fetchFirst: () => ({
          id: 1,
          name: 'John',
          email: 'john@example.com',
          age: 30,
        }),
        update: async ({ key, item }) => {
          if (typeof key === 'string') {
            throw new TypeError('Key should be a number')
          }
          submittedData = { key, item }
          return {
            id: key,
            name: 'John',
            email: 'john@example.com',
            age: 30,
            ...item,
          }
        },
      },
    })

    const store = await createStore({
      schema: [
        Users,
      ],
      plugins: [],
    })

    const form = await store.users.updateForm(1)

    // Only change the name
    form.name = 'Jane'
    await form.$submit()

    // Only the changed property should be submitted
    expect(submittedData.key).toBe(1)
    expect(submittedData.item).toEqual({ name: 'Jane' })
  })

  it('should submit all properties when pickOnlyChanged is false', async () => {
    let submittedData: any = null

    const Users = withItemType<{
      id: number
      name: string
      email: string
      age: number
    }>().defineCollection({
      name: 'users',
      hooks: {
        fetchFirst: () => ({
          id: 1,
          name: 'John',
          email: 'john@example.com',
          age: 30,
        }),
        update: async ({ key, item }) => {
          if (typeof key === 'string') {
            throw new TypeError('Key should be a number')
          }
          submittedData = { key, item }
          return { id: key, name: 'John', email: 'john@example.com', age: 30, ...item }
        },
      },
    })

    const store = await createStore({
      schema: [Users],
      plugins: [],
    })

    const form = await store.users.updateForm(1, {
      pickOnlyChanged: false,
    })

    // Only change the name
    form.name = 'Jane'
    await form.$submit()

    // All properties should be submitted
    expect(submittedData.key).toBe(1)
    expect(submittedData.item).toEqual({
      id: 1,
      name: 'Jane',
      email: 'john@example.com',
      age: 30,
    })
  })

  it('should reset form with original default values', async () => {
    const Users = withItemType<{
      id: number
      name: string
      email: string
      age: number
    }>().defineCollection({
      name: 'users',
      hooks: {
        fetchFirst: () => ({
          id: 1,
          name: 'John',
          email: 'john@example.com',
          age: 30,
        }),
        update: async ({ key, item }) => {
          if (typeof key === 'string') {
            throw new TypeError('Key should be a number')
          }
          return { id: key, name: 'John', email: 'john@example.com', age: 30, ...item }
        },
      },
    })

    const store = await createStore({
      schema: [Users],
      plugins: [],
    })

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
  })

  it('should handle nested object default values', async () => {
    const Profiles = withItemType<{
      id: number
      user: {
        name: string
        settings: {
          theme: string
          notifications: boolean
        }
      }
    }>().defineCollection({
      name: 'profiles',
      hooks: {
        fetchFirst: () => ({
          id: 1,
          user: {
            name: 'John',
            settings: {
              theme: 'dark',
              notifications: true,
            },
          },
        }),
        update: async ({ key, item }) => {
          if (typeof key === 'string') {
            throw new TypeError('Key should be a number')
          }
          return { id: key, user: { name: 'John', settings: { theme: 'dark', notifications: true } }, ...item }
        },
      },
    })

    const store = await createStore({
      schema: [Profiles],
      plugins: [],
    })

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
    const Articles = withItemType<{
      id: number
      title: string
      tags: string[]
    }>().defineCollection({
      name: 'articles',
      hooks: {
        fetchFirst: () => ({
          id: 1,
          title: 'Article Title',
          tags: ['original', 'tags'],
        }),
        update: async ({ key, item }) => {
          if (typeof key === 'string') {
            throw new TypeError('Key should be a number')
          }
          return { id: key, title: 'Article Title', tags: ['original', 'tags'], ...item }
        },
      },
    })

    const store = await createStore({
      schema: [Articles],
      plugins: [],
    })

    const form = await store.articles.updateForm(1, {
      defaultValues: () => ({
        tags: ['new', 'default', 'tags'],
      }),
    })

    expect(form.title).toBe('Article Title')
    expect(form.tags).toEqual(['new', 'default', 'tags'])
  })

  it('should handle empty default values function', async () => {
    const Users = withItemType<{
      id: number
      name: string
      email: string
    }>().defineCollection({
      name: 'users',
      hooks: {
        fetchFirst: () => ({
          id: 1,
          name: 'John',
          email: 'john@example.com',
        }),
        update: async ({ key, item }) => {
          if (typeof key === 'string') {
            throw new TypeError('Key should be a number')
          }
          return { id: key, name: 'John', email: 'john@example.com', ...item }
        },
      },
    })

    const store = await createStore({
      schema: [Users],
      plugins: [],
    })

    const form = await store.users.updateForm(1, {
      defaultValues: () => ({}),
    })

    // Should use item data when default values is empty
    expect(form.name).toBe('John')
    expect(form.email).toBe('john@example.com')
  })

  it('should use key parameter with filter options', async () => {
    const Users = withItemType<{
      id: number
      name: string
      status: string
    }>().defineCollection({
      name: 'users',
      hooks: {
        fetchFirst: (options: any) => {
          if (options?.filter?.status === 'active') {
            return {
              id: 2,
              name: 'Active User',
              status: 'active',
            }
          }
          return null
        },
        update: async ({ key, item }) => {
          if (typeof key === 'string') {
            throw new TypeError('Key should be a number')
          }
          return { id: key, name: 'Active User', status: 'active', ...item }
        },
      },
    })

    const store = await createStore({
      schema: [Users],
      plugins: [],
    })

    const form = await store.users.updateForm({
      filter: { status: 'active' },
    }, {
      defaultValues: () => ({
        name: 'Overridden Name',
      }),
    })

    expect(form.name).toBe('Overridden Name')
    expect(form.status).toBe('active')
  })

  it('should handle null values in default values', async () => {
    const Items = withItemType<{
      id: number
      name: string
      description: string | null
      category: string
    }>().defineCollection({
      name: 'items',
      hooks: {
        fetchFirst: () => ({
          id: 1,
          name: 'Item Name',
          description: 'Item Description',
          category: 'Electronics',
        }),
        update: async ({ key, item }) => {
          if (typeof key === 'string') {
            throw new TypeError('Key should be a number')
          }
          return { id: key, name: 'Item Name', description: 'Item Description', category: 'Electronics', ...item }
        },
      },
    })

    const store = await createStore({
      schema: [Items],
      plugins: [],
    })

    const form = await store.items.updateForm(1, {
      defaultValues: () => ({
        description: null,
      }),
    })

    expect(form.name).toBe('Item Name')
    expect(form.description).toBe(null)
    expect(form.category).toBe('Electronics')
  })

  it('should work with transformData option', async () => {
    let submittedData: any = null

    const Users = withItemType<{
      id: number
      firstName: string
      lastName: string
    }>().defineCollection({
      name: 'users',
      hooks: {
        fetchFirst: () => ({
          id: 1,
          firstName: 'John',
          lastName: 'Doe',
        }),
        update: async ({ key, item }) => {
          if (typeof key === 'string') {
            throw new TypeError('Key should be a number')
          }
          submittedData = { key, item }
          return { id: key, firstName: 'John', lastName: 'Doe', ...item }
        },
      },
    })

    const store = await createStore({
      schema: [Users],
      plugins: [],
    })

    const form = await store.users.updateForm(1, {
      defaultValues: () => ({
        firstName: 'Jane',
      }),
      transformData: (data: any) => ({
        ...data,
        fullName: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
      }),
      pickOnlyChanged: false,
    })

    await form.$submit()

    expect(submittedData.item.fullName).toBe('Jane Doe')
  })
})
