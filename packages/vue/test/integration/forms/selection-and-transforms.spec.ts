import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it } from 'vitest'

describe('updateForm', () => {
  it.each(['params.where', 'custom filter'])('submits edits selected through %s and preserves the other user', async (input) => {
    const inactive = { id: 1, name: 'Inactive User', status: 'inactive' }
    const active = { id: 2, name: 'Active User', status: 'active' }
    const originalRows = structuredClone([inactive, active])
    const findOptions = input === 'custom filter'
      ? { filter: { status: 'active' } }
      : { params: { where: { status: 'active' } } }
    const { store, remote } = await createVueStack({
      schema: [{ name: 'users' }],
      data: { users: [inactive, active] },
      on: input === 'custom filter'
        ? { fetchFirst: ctx => ctx.rows().find(row => row.status === ctx.payload.findOptions.filter.status) }
        : undefined,
    })

    const form = await store.users.updateForm(findOptions, {
      defaultValues: () => ({
        name: 'Overridden Name',
      }),
    })

    expect(form.name).toBe('Overridden Name')
    expect(form.status).toBe('active')
    expect(remote.lastRequest('fetchFirst')).toMatchObject({ collection: 'users', findOptions })

    form.name = 'Edited Active User'
    await form.$submit()

    expect(remote.lastRequest('updateItem')!.key).toBe(2)
    expect(remote.lastRequest('updateItem')!.item).toEqual({ name: 'Edited Active User' })
    const expectedRows = [
      { id: 1, name: 'Inactive User', status: 'inactive' },
      { id: 2, name: 'Edited Active User', status: 'active' },
    ]
    expect(remote.rows('users')).toEqual(expectedRows)
    expect([inactive, active]).toEqual(originalRows)
    const reader = await createVueStack({ schema: [{ name: 'users' }], remote })
    const users = await reader.store.users.findMany()
    expect(users.map((user: any) => ({ id: user.id, name: user.name, status: user.status })))
      .toEqual(expectedRows)
  })

  it('persists a null default without removing unrelated item fields', async () => {
    const { store, remote } = await createVueStack({ schema: [{ name: 'items' }], data: { items: [{
      id: 1,
      name: 'Item Name',
      description: 'Item Description',
      category: 'Electronics',
    }] } })

    const form = await store.items.updateForm(1, {
      defaultValues: () => ({
        description: null,
      }),
      pickOnlyChanged: false,
    })

    expect(form.name).toBe('Item Name')
    expect(form.description).toBe(null)
    expect(form.category).toBe('Electronics')

    await form.$submit()

    const expected = { id: 1, name: 'Item Name', description: null, category: 'Electronics' }
    expect(remote.lastRequest('updateItem')!.item).toEqual(expected)
    expect(remote.rows('items')).toEqual([expected])
    const reader = await createVueStack({ schema: [{ name: 'items' }], remote })
    const item = await reader.store.items.findFirst(1)
    expect({ id: item.id, name: item.name, description: item.description, category: item.category })
      .toEqual(expected)
  })

  it('transforms current form values while preserving all submitted fields', async () => {
    const otherUser = { id: 2, firstName: 'Other', lastName: 'User', newsletter: true, loginCount: 7, nickname: 'other' }
    const originalOtherUser = structuredClone(otherUser)
    const { store, remote } = await createVueStack({ schema: [{ name: 'users' }], data: { users: [{
      id: 1,
      firstName: 'John',
      lastName: 'Doe',
      newsletter: false,
      loginCount: 0,
      nickname: '',
    }, otherUser] } })

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

    form.lastName = 'Smith'
    await form.$submit()

    const expected = {
      id: 1,
      firstName: 'Jane',
      lastName: 'Smith',
      newsletter: false,
      loginCount: 0,
      nickname: '',
      fullName: 'Jane Smith',
    }
    expect(remote.lastRequest('updateItem')!.key).toBe(1)
    expect(remote.lastRequest('updateItem')!.item).toEqual(expected)
    expect(remote.rows('users')).toEqual([expected, originalOtherUser])
    expect(otherUser).toEqual(originalOtherUser)
    expect(store.users.peekFirst(1)).toMatchObject(expected)
    const reader = await createVueStack({ schema: [{ name: 'users' }], remote })
    const user = await reader.store.users.findFirst(1)
    expect({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      newsletter: user.newsletter,
      loginCount: user.loginCount,
      nickname: user.nickname,
      fullName: user.fullName,
    }).toEqual(expected)
  })
})
