import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { nextTick } from 'vue'

describe('form submission recovery', () => {
  it('rolls back a failed submit, keeps pending edits, and commits them on retry', async () => {
    const stack = await createVueStack({
      schema: [{ name: 'posts' }],
      data: { posts: [
        { id: '1', title: 'Original', body: 'Body' },
        { id: '2', title: 'Unrelated', body: 'Keep this body' },
      ] },
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
    const originalRows = [
      { id: '1', title: 'Original', body: 'Body' },
      { id: '2', title: 'Unrelated', body: 'Keep this body' },
    ]
    expect(stack.remote.rows('posts')).toEqual(originalRows)
    form.body = 'Edited while saving'
    release()
    await rejection
    expect(form.$loading).toBe(false)
    expect(form.$error.message).toBe('fake-remote: updateItem failed')
    expect(form.$hasChanges()).toBe(true)
    expect(form.title).toBe('Submitted')
    expect(form.body).toBe('Edited while saving')
    expect(list.data.value.map((post: any) => ({ id: post.id, title: post.title, body: post.body }))).toEqual(originalRows)
    expect(stack.remote.rows('posts')).toEqual(originalRows)

    await form.$submit()
    await nextTick()
    expect(stack.remote.lastRequest('updateItem')!.key).toBe('1')
    expect(stack.remote.lastRequest('updateItem')!.item).toEqual({ title: 'Submitted', body: 'Edited while saving' })
    const expectedRows = [
      { id: '1', title: 'Submitted', body: 'Edited while saving' },
      { id: '2', title: 'Unrelated', body: 'Keep this body' },
    ]
    expect(stack.remote.rows('posts')).toEqual(expectedRows)
    expect(list.data.value.map((post: any) => ({ id: post.id, title: post.title, body: post.body }))).toEqual(expectedRows)
    expect(form.$error).toBeNull()
    expect(form.$loading).toBe(false)
    expect(form.$hasChanges()).toBe(false)
    const reader = await createVueStack({ schema: [{ name: 'posts' }], remote: stack.remote })
    const posts = await reader.store.posts.findMany()
    expect(posts.map((post: any) => ({ id: post.id, title: post.title, body: post.body }))).toEqual(expectedRows)
  })

  it('acknowledges only submitted edits and persists later edits on the next submit', async () => {
    const stack = await createVueStack({
      schema: [{ name: 'posts' }],
      data: { posts: [{ id: '1', title: 'Original', body: 'Original body' }] },
    })
    const list = await stack.run(() => stack.store.posts.query((q: any) => q.many()))
    const form = await stack.store.posts.updateForm('1')
    form.title = 'Submitted'
    const release = stack.remote.holdNext('updateItem')
    onTestFinished(release)
    const pending = form.$submit()
    await vi.waitFor(() => expect(stack.remote.callCount('updateItem')).toBe(1))
    form.title = 'Next title'
    form.body = 'Next body'
    expect(stack.remote.lastRequest('updateItem')!.item).toEqual({ title: 'Submitted' })
    expect(stack.remote.rows('posts')).toEqual([{ id: '1', title: 'Original', body: 'Original body' }])

    release()
    await pending
    expect(stack.remote.rows('posts')).toEqual([{ id: '1', title: 'Submitted', body: 'Original body' }])
    expect(list.data.value[0]).toMatchObject({ id: '1', title: 'Submitted', body: 'Original body' })
    expect(form.title).toBe('Next title')
    expect(form.body).toBe('Next body')
    expect(form.$changedProps).toEqual({ title: ['Next title', 'Submitted'], body: ['Next body', 'Original body'] })
    expect(form.$hasChanges()).toBe(true)
    expect(form.$loading).toBe(false)

    await form.$submit()
    expect(stack.remote.requests('updateItem').map(request => ({ key: request.key, item: request.item }))).toEqual([
      { key: '1', item: { title: 'Submitted' } },
      { key: '1', item: { title: 'Next title', body: 'Next body' } },
    ])
    expect(stack.remote.rows('posts')).toEqual([{ id: '1', title: 'Next title', body: 'Next body' }])
    expect(list.data.value[0]).toMatchObject({ id: '1', title: 'Next title', body: 'Next body' })
    expect(form.$changedProps).toEqual({})
    expect(form.$hasChanges()).toBe(false)
  })
})
