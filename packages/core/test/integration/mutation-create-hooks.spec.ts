import type { CoreStack } from '#test-utils/store/coreStack'
import type { Plugin } from '@rstore/shared'
import { createCoreStack } from '#test-utils/store/coreStack'
import { createItem } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'

/** Runs createItem through a fake remote, making hook payloads observable on wire and cache. */
function setup(plugins: Plugin[]) {
  return createCoreStack({ schema: [{ name: 'todos' }], plugins })
}

/** Creates one todo with the stack's real collection hook chain. */
function create(stack: CoreStack, item: Record<string, any>) {
  return createItem({ store: stack.store, collection: stack.collection('todos'), item: item as any })
}

describe('createItem beforeMutation hooks', () => {
  it('sends nested modifyItem changes to fake remote and commits them to cache', async () => {
    const stack = await setup([{
      name: 'nested-before-mutation',
      setup({ hook }: any) {
        hook('beforeMutation', ({ modifyItem }: any) => modifyItem('profile.city', 'Paris'))
      },
    }])

    const created = await create(stack, { id: 'nested', title: 'Original' })

    expect(stack.remote.lastRequest('createItem')!.item).toEqual({
      id: 'nested',
      title: 'Original',
      profile: { city: 'Paris' },
    })
    expect(created).toMatchObject({ profile: { city: 'Paris' } })
    expect(stack.read('todos', 'nested')).toMatchObject({ profile: { city: 'Paris' } })
  })

  it('sends setItem replacement, derives its key, and leaves no original cache state', async () => {
    const stack = await setup([{
      name: 'replace-before-mutation',
      setup({ hook }: any) {
        hook('beforeMutation', ({ setItem }: any) => {
          setItem({ id: 'replacement', title: 'Replaced by hook' })
        })
      },
    }])

    const created = await create(stack, { id: 'original', title: 'Original' })

    expect(stack.remote.lastRequest('createItem')!.item).toEqual({ id: 'replacement', title: 'Replaced by hook' })
    expect(created).toMatchObject({ id: 'replacement', title: 'Replaced by hook' })
    expect(stack.read('todos', 'replacement')).toMatchObject({ title: 'Replaced by hook' })
    expect(stack.read('todos', 'original')).toBeUndefined()
    expect(stack.store.$mutationHistory).toContainEqual({
      operation: 'create',
      collection: stack.collection('todos'),
      key: 'replacement',
      payload: { id: 'replacement', title: 'Replaced by hook' },
    })
  })

  it('shows a hook replacement in its optimistic layer before the remote answers', async () => {
    const stack = await setup([{
      name: 'replace-before-mutation',
      setup({ hook }: any) {
        hook('beforeMutation', ({ setItem }: any) => setItem({ id: 'replacement', title: 'Replaced by hook' }))
      },
    }])
    const release = stack.remote.holdNext('createItem')

    const pending = create(stack, { id: 'original', title: 'Original' })
    await vi.waitFor(() => expect(stack.remote.callCount('createItem')).toBe(1))

    // The layer must match the payload after the hook, not caller input that
    // can have a different key and fields.
    expect(stack.read('todos', 'replacement')).toMatchObject({ id: 'replacement', title: 'Replaced by hook' })
    expect(stack.read('todos', 'original')).toBeUndefined()

    release()
    await pending
  })

  it('keeps a replaced optimistic item parsed until the response is parsed once', async () => {
    const parseTags = vi.fn((value: string) => value.split(','))
    const stack = await createCoreStack({
      schema: [{
        name: 'todos',
        fields: {
          tags: {
            parse: parseTags,
            serialize: (value: string[]) => value.join(','),
          },
        },
      }],
      plugins: [{
        name: 'replace-before-mutation',
        setup({ hook }: any) {
          hook('beforeMutation', ({ setItem }: any) => setItem({ id: 'replacement', tags: ['a', 'b'] }))
        },
      }],
    })
    const release = stack.remote.holdNext('createItem')
    const pending = createItem({
      store: stack.store,
      collection: stack.collection('todos'),
      item: { id: 'original', tags: ['original'] } as any,
    })
    await vi.waitFor(() => expect(stack.remote.callCount('createItem')).toBe(1))

    // The layer retains application values while its wire payload is already
    // serialized. Parsing here would make the final response parse twice.
    expect(stack.read('todos', 'replacement')!.tags).toEqual(['a', 'b'])
    expect(stack.remote.lastRequest('createItem')!.item!.tags).toBe('a,b')
    expect(parseTags).not.toHaveBeenCalled()

    release()
    await pending

    expect(parseTags).toHaveBeenCalledTimes(1)
    expect(stack.read('todos', 'replacement')!.tags).toEqual(['a', 'b'])
  })
})
