import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it } from 'vitest'

describe('updateForm', () => {
  it('should use key parameter with filter options', async () => {
    const { store } = await createVueStack({ schema: [{ name: 'users' }], data: { users: [{ id: 2, name: 'Active User', status: 'active' }] }, on: { fetchFirst: ctx => ctx.rows().find(row => row.status === ctx.payload.findOptions.filter.status) } })

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
    const { store } = await createVueStack({ schema: [{ name: 'items' }], data: { items: [{
      id: 1,
      name: 'Item Name',
      description: 'Item Description',
      category: 'Electronics',
    }] } })

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
    const { store, remote } = await createVueStack({ schema: [{ name: 'users' }], data: { users: [{
      id: 1,
      firstName: 'John',
      lastName: 'Doe',
    }] } })

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

    expect(remote.lastRequest('updateItem')!.item!.fullName).toBe('Jane Doe')
    expect(remote.rows('users')[0]).toMatchObject({ id: 1, firstName: 'Jane', lastName: 'Doe', fullName: 'Jane Doe' })
    expect(store.users.peekFirst(1)).toMatchObject({ fullName: 'Jane Doe' })
  })
})
