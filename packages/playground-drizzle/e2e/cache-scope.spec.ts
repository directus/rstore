import { expect, test } from '@playwright/test'

test('attests a complete SQLite result while leaving paginated or unapproved scopes unverified', async ({ request }) => {
  const id = crypto.randomUUID()
  const created = await request.post('/api/rstore/todos', { data: { json: { id, title: 'Scoped SQLite row', completed: 0 } } })
  expect(created.ok()).toBe(true)
  try {
    const read = (value: number, limit?: number) => request.get('/api/rstore/todos', {
      headers: { 'x-rstore-query-cache': 'scope' },
      params: { superjson: JSON.stringify({ json: { where: { operator: 'eq', field: 'completed', value }, limit } }) },
    })

    const full = await read(0)
    expect(full.ok()).toBe(true)
    expect(await full.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id })]))
    expect(JSON.parse(decodeURIComponent(full.headers()['x-rstore-query-cache']!))).toEqual({
      completeScope: { field: 'completed', value: 0 },
    })

    const limited = await read(0, 1)
    expect(limited.ok()).toBe(true)
    expect(await limited.json()).toHaveLength(1)
    expect(limited.headers()['x-rstore-query-cache']).toBeUndefined()

    const unapproved = await read(99)
    expect(unapproved.ok()).toBe(true)
    expect(await unapproved.json()).toEqual([])
    expect(unapproved.headers()['x-rstore-query-cache']).toBeUndefined()
  }
  finally {
    await request.delete(`/api/rstore/todos/${id}`)
  }
})
