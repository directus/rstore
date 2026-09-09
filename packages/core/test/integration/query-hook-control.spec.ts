import type { Plugin } from '@rstore/shared'
import { createCoreStack } from '#test-utils/store/coreStack'
import { findFirst, findMany } from '@rstore/core'
import { describe, expect, it } from 'vitest'

type QueryKind = 'first' | 'many'

/** Runs one public query with a plugin before the fake remote. */
async function run(kind: QueryKind, callback: (payload: any) => void) {
  const hook: 'fetchFirst' | 'fetchMany' = kind === 'first' ? 'fetchFirst' : 'fetchMany'
  const plugin: Plugin = {
    name: `control-${kind}`,
    category: 'local',
    setup({ hook: register }) {
      register(hook, callback)
    },
  }
  const stack = await createCoreStack({
    schema: [{ name: 'todos' }],
    data: { todos: [{ id: '1', title: 'Remote' }] },
    plugins: [plugin],
  })
  const target = { store: stack.store, collection: stack.collection('todos') }
  const response = kind === 'first'
    ? await findFirst({ ...target, findOptions: { key: '1', fetchPolicy: 'fetch-only' } })
    : await findMany({ ...target, findOptions: { fetchPolicy: 'fetch-only' } })
  return { response, stack, hook }
}

describe('fetch hook control', () => {
  it.each(['first', 'many'] as const)('lets a later plugin replace a non-empty %s result when abort is false', async (kind) => {
    const { response, stack, hook } = await run(kind, payload => payload.setResult(
      kind === 'first' ? { id: 'early', title: 'Early' } : [{ id: 'early', title: 'Early' }],
      { abort: false },
    ))

    const titles = kind === 'first'
      ? [(response.result as any)?.title]
      : (response.result as any[]).map(item => item.title)
    expect(titles).toEqual(['Remote'])
    expect(stack.remote.callCount(hook)).toBe(1)
  })

  it.each(['first', 'many'] as const)('lets a later plugin answer an empty %s result', async (kind) => {
    const { response, stack, hook } = await run(kind, payload => payload.setResult(kind === 'first' ? null : []))

    const titles = kind === 'first'
      ? [(response.result as any)?.title]
      : (response.result as any[]).map(item => item.title)
    expect(titles).toEqual(['Remote'])
    expect(stack.remote.callCount(hook)).toBe(1)
  })

  it.each(['first', 'many'] as const)('stops later plugins when %s explicitly aborts without a result', async (kind) => {
    const { response, stack, hook } = await run(kind, payload => payload.abort())

    expect(response.result).toEqual(kind === 'first' ? null : [])
    expect(stack.remote.callCount(hook)).toBe(0)
    expect(stack.readMany('todos')).toEqual([])
  })
})
