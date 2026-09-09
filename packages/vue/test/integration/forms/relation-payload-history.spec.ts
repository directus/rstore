import { describe, expect, it } from 'vitest'
import { computed, nextTick } from 'vue'
import { createPostsForm, createPostsPayload, createProfileForm, createProfilePayload } from '../../utils/form-relation-reactivity'

describe('createFormObject - relation payload reactivity', () => {
  it('returns detached cloned raw relation data', async () => {
    const { form } = await createProfileForm()
    form.profile = createProfilePayload('profile-1')
    const clonedData = form.$getRawData({ clone: true })

    clonedData.profile._connect.key.id = 'profile-2'

    expect(form.profile._connect.key.id).toBe('profile-1')
    expect(form.$getRaw('profile')).toEqual(createProfilePayload('profile-1'))
  })

  it('returns detached cloned raw relation arrays', async () => {
    const { form } = await createPostsForm()
    form.posts = createPostsPayload('post-1')
    const clonedData = form.$getRawData({ clone: true })

    clonedData.posts[0]._connect.keys[0].id = 'post-2'

    expect(form.posts[0]._connect.keys[0].id).toBe('post-1')
    expect(form.$getRaw('posts')).toEqual(createPostsPayload('post-1'))
  })

  it('keeps restored relation payloads reactive after undo and redo, and clears them on reset', async () => {
    const initialPayload = createProfilePayload('profile-1')
    const nextPayload = createProfilePayload('profile-2')
    const { form } = await createProfileForm()
    form.profile = initialPayload
    const profileId = computed(() => form.profile._connect?.key.id ?? null)

    form.profile = nextPayload
    await nextTick()

    expect(profileId.value).toBe('profile-2')
    expect(form.profile.$connect).toBeTypeOf('function')

    form.$opLog.undo()
    await nextTick()

    expect(profileId.value).toBe('profile-1')
    expect(form.profile.$connect).toBeTypeOf('function')

    form.$opLog.redo()
    await nextTick()

    expect(profileId.value).toBe('profile-2')
    expect(form.profile.$connect).toBeTypeOf('function')

    await form.$reset()
    await nextTick()

    expect(profileId.value).toBe(null)
    expect(form.profile.$connect).toBeTypeOf('function')
  })

  it('keeps restored relation array payloads reactive after undo and redo, and clears them on reset', async () => {
    const initialPayload = createPostsPayload('post-1')
    const nextPayload = createPostsPayload('post-2')
    const { form } = await createPostsForm()
    form.posts = initialPayload
    const postId = computed(() => form.$getRaw('posts')?.[0]?._connect?.keys[0]?.id ?? null)

    form.posts = nextPayload
    await nextTick()

    expect(postId.value).toBe('post-2')
    expect(form.posts.$connect).toBeTypeOf('function')

    form.$opLog.undo()
    await nextTick()

    expect(postId.value).toBe('post-1')
    expect(form.posts.$connect).toBeTypeOf('function')

    form.$opLog.redo()
    await nextTick()

    expect(postId.value).toBe('post-2')
    expect(form.posts.$connect).toBeTypeOf('function')

    await form.$reset()
    await nextTick()

    expect(postId.value).toBe(null)
    expect(form.posts.$connect).toBeTypeOf('function')
  })

  it('keeps default many-relation arrays as submitted payload', async () => {
    const posts = [
      { id: 'post-1', title: 'First' },
      { id: 'post-2', title: 'Second' },
    ]
    const { form } = await createPostsForm(posts)

    expect(form.posts.$value).toEqual([])
    expect(form.$getRaw('posts')).toEqual(posts)
    expect(form.$getRawData()).toEqual({ id: 'user-1', name: 'John', posts })

    form.posts.$set([{ id: 'post-3', title: 'Third' }])

    expect(form.posts.$value).toEqual([{ id: 'post-3', title: 'Third' }])
    expect(form.$getRaw('posts')).toEqual(posts)
  })

  it('keeps default relation objects as submitted payload', async () => {
    const profile = { id: 'profile-1', name: 'Ada' }
    const { form } = await createProfileForm(profile)

    expect(form.profile.$value).toBe(null)
    expect(form.$getRaw('profile')).toEqual(profile)
    expect(form.$getRawData()).toEqual({ id: 'user-1', name: 'John', profileId: null, profile })
  })
})
