import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { nextTick } from 'vue'

describe('form submission recovery', () => {
  it('rolls back a failed submit, keeps pending edits, and commits them on retry', async () => {
    const stack = await createVueStack({
      schema: [{ name: 'posts' }],
      data: { posts: [{ id: '1', title: 'Original', body: 'Body' }] },
    })
    const list = await stack.run(() => stack.store.posts.query((q: any) => q.many()))
    const form = await stack.store.posts.updateForm('1')
    form.title = 'Submitted'
    const release = stack.remote.holdNext('updateItem')
    onTestFinished(release)
    stack.remote.failNext('updateItem')
    const pending = form.$submit()
    const rejection = expect(pending).rejects.toThrow('fake-remote: updateItem failed')
    await vi.waitFor(() => expect(stack.remote.callCount('updateItem')).toBe(1))
    expect(form.$loading).toBe(true)
    expect(list.data.value[0].title).toBe('Submitted')
    expect(stack.remote.rows('posts')[0]!.title).toBe('Original')
    form.body = 'Edited while saving'
    release()
    await rejection
    expect(form.$loading).toBe(false)
    expect(form.$error.message).toBe('fake-remote: updateItem failed')
    expect(form.$hasChanges()).toBe(true)
    expect(form.title).toBe('Submitted')
    expect(form.body).toBe('Edited while saving')
    expect(list.data.value[0]).toMatchObject({ title: 'Original', body: 'Body' })

    await form.$submit()
    await nextTick()
    expect(stack.remote.lastRequest('updateItem')!.item).toEqual({ title: 'Submitted', body: 'Edited while saving' })
    expect(stack.remote.rows('posts')).toEqual([{ id: '1', title: 'Submitted', body: 'Edited while saving' }])
    expect(list.data.value[0]).toMatchObject(stack.remote.rows('posts')[0]!)
    expect(form.$error).toBeNull()
    expect(form.$loading).toBe(false)
    expect(form.$hasChanges()).toBe(false)
  })
})
