import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupLiveTodos, subscription } from '../../utils/live-query'

// Real live query and cache; versions use formats `compareHLC` cannot read,
// such as a Postgres LSN or a transaction id.
describe('result versions outside the accepted format', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects an invalid push version synchronously without changing the page', async () => {
    const { store, run, payloads } = await setupLiveTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache' })))
    const payload = await subscription(payloads)
    expect(() => payload.setResult!([], { version: 'tx-42' })).toThrow(/Invalid result version "tx-42"/)
    expect(payload.setResult!([{ id: '1', title: 'Pushed' }], { version: 5 })).toBe('applied')
    expect(() => payload.setResult!([], { version: '0/16B3748' })).toThrow(/Invalid result version/)
    expect(() => payload.setResult!([], { version: Number.NaN })).toThrow(/Invalid result version/)
    expect(query.data.value).toEqual([{ id: '1', title: 'Pushed' }])
    expect(payload.setResult!([], { version: 4 })).toBe('stale')
  })

  it('warns and treats an invalid fetch version as unversioned', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { store, run, remote, payloads } = await setupLiveTodos({
      on: { fetchMany: (ctx: any) => {
        ctx.payload.meta.$resultVersion = 'tx-42'
        return ctx.next()
      } },
    })
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ resultMode: 'responseRefs' })))
    const payload = await subscription(payloads)
    expect(payload.setResult!([{ id: '1', title: 'One' }], { version: 5 })).toBe('applied')
    remote.seed('todos', [{ id: '2', title: 'Two' }])
    await query.refresh()
    expect(query.error.value).toBeNull()
    expect(query.data.value.map((row: any) => row.id)).toEqual(['2'])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"tx-42"'))
    // The unversioned fetch cleared the page version.
    expect(payload.setResult!([], { version: 1 })).toBe('applied')
  })
})
