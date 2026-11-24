import { describe, expect, it, vi } from 'vitest'
import { setupExactTodos } from './exact-todos'

describe('local creates in exact pages', () => {
  it('shows the new row on the captured page and adopts the canonical key on acknowledgement', async () => {
    const stack = await setupExactTodos({ data: { todos: [] } })
    const page = await stack.run(() => stack.store.todos.query(q => q.many({ resultMode: 'responseRefs' })))
    const other = await stack.run(() => stack.store.todos.query(q => q.many({
      resultMode: 'responseRefs',
      params: { where: { title: 'Elsewhere' } },
    })))
    const release = stack.remote.holdNext('createItem')
    const refresh = stack.remote.holdNext('fetchMany')
    const pending = stack.store.todos.create({ id: 'draft', title: 'Draft' }, {
      insertInto: [{ page: page.getPageTarget(), position: 'start' }],
    })
    stack.remote.respondNext('createItem', () => {
      stack.remote.seed('todos', [{ id: 'server', title: 'Draft' }])
      return { id: 'server', title: 'Draft' }
    })
    try {
      await vi.waitFor(() => expect(page.data.value.map(row => row.id)).toEqual(['draft']))
      expect(other.data.value).toEqual([])
      expect(page.confirmed.value).toBe(true)
      release()
      await pending
      expect(page.data.value.map(row => row.id)).toEqual(['server'])
    }
    finally {
      release()
      refresh()
      await pending
    }
    await page.foreground.promise
    expect(page.data.value.map(row => row.id)).toEqual(['server'])
  })

  it('uses connector proof on an opt-in empty page and rolls back rejected creates', async () => {
    const stack = await setupExactTodos({ data: { todos: [] } })
    stack.store.$hooks.hook('resolveCreatePlacement', ({ row, setPlacement }) => {
      if (row.title === 'Matching')
        setPlacement('end')
    })
    const createList = (auto: boolean) => stack.store.todos.query(q => q.many({
      resultMode: 'responseRefs',
      localMembership: auto ? 'auto' : undefined,
    }))

    const inferred = await stack.run(() => createList(true))
    const ordinary = await stack.run(() => createList(false))
    const release = stack.remote.holdNext('createItem')
    stack.remote.failNext('createItem', new Error('Denied'))
    const created = stack.store.todos.create({ id: 'mine', title: 'Matching' })
    const rejected = expect(created).rejects.toThrow('Denied')
    try {
      await vi.waitFor(() => expect(inferred.data.value.map(row => row.id)).toEqual(['mine']))
      expect(ordinary.data.value).toEqual([])
    }
    finally {
      release()
      await rejected
    }
    expect(inferred.data.value).toEqual([])
    expect(stack.store.todos.peekFirst('mine')).toBeFalsy()
  })
})

it('keeps an acknowledged create visible while an older page response finishes', async () => {
  const stack = await setupExactTodos({ data: { todos: [] } })
  const page = await stack.run(() => stack.store.todos.query(q => q.many({ resultMode: 'responseRefs' })))
  const oldRead = stack.remote.holdNext('fetchMany')
  stack.remote.respondNext('fetchMany', () => [])
  const revalidation = page.refresh()
  await vi.waitFor(() => expect(stack.remote.callCount('fetchMany')).toBe(2))

  const newRead = stack.remote.holdNext('fetchMany')
  const create = stack.store.todos.create({ id: 'new', title: 'New' }, {
    insertInto: [{ page: page.getPageTarget(), position: 'start' }],
  })
  try {
    await create
    await vi.waitFor(() => expect(stack.remote.callCount('fetchMany')).toBe(3))
    oldRead()
    await revalidation
    expect(page.data.value.map(row => row.id)).toEqual(['new'])
  }
  finally {
    oldRead()
    newRead()
    await page.foreground.promise
  }
  expect(page.data.value.map(row => row.id)).toEqual(['new'])
})
