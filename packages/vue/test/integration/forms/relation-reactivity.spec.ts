import { describe, expect, it } from 'vitest'
import { computed, nextTick, watch } from 'vue'
import { createPostsForm, createPostsPayload, createProfileForm, createProfilePayload } from '../../utils/form-relation-reactivity'

describe('createFormObject - relation payload reactivity', () => {
  it('updates computed payload reads after relation payload assignment', async () => {
    const { form } = await createProfileForm()
    const firstPayload = createProfilePayload('profile-1')
    const nextPayload = createProfilePayload('profile-2')
    form.profile = firstPayload
    const profileId = computed(() => form.profile._connect?.key.id ?? null)

    expect(profileId.value).toBe('profile-1')

    form.profile = nextPayload
    await nextTick()

    expect(profileId.value).toBe('profile-2')
    expect(form.$opLog.getAll().map((op: any) => op.newValue)).toEqual([firstPayload, nextPayload])
  })

  it('updates computed array payload reads after relation payload assignment', async () => {
    const { form } = await createPostsForm()
    form.posts = createPostsPayload('post-1')
    const postId = computed(() => form.$getRaw('posts')?.[0]?._connect?.keys[0]?.id ?? null)

    expect(postId.value).toBe('post-1')

    form.posts = createPostsPayload('post-2')
    await nextTick()

    expect(postId.value).toBe('post-2')
  })

  it('keeps writable raw relation arrays reactive', async () => {
    let submittedData: any
    let submittedOps: any[] = []
    const { form } = await createPostsForm(undefined, async (data: any, { formOperations }: any) => {
      submittedData = data
      submittedOps = formOperations
    })
    const fieldValue = computed<any[]>({
      get: () => form.$getRaw('posts'),
      set: value => form.posts = value,
    })
    const operationCount = computed(() => fieldValue.value?.length ?? 0)

    expect(fieldValue.value).toBeUndefined()

    fieldValue.value = []
    await nextTick()

    expect(Array.isArray(form.posts)).toBe(true)
    expect(operationCount.value).toBe(0)
    expect(form.$getRawData()).toEqual({
      id: 'user-1',
      name: 'John',
      posts: [],
    })

    fieldValue.value.push({ _connect: { keys: [{ id: 'post-1' }] } })
    await nextTick()

    expect(operationCount.value).toBe(1)
    expect(form.$getRawData()).toEqual({
      id: 'user-1',
      name: 'John',
      posts: createPostsPayload('post-1'),
    })

    await form.$submit()

    expect(submittedData.posts).toEqual(createPostsPayload('post-1'))
    expect(submittedOps[0].newValue).toEqual(createPostsPayload('post-1'))
    expect(Object.getOwnPropertySymbols(submittedOps[0])).toEqual([])
    expect('$connect' in submittedOps[0].newValue).toBe(false)
  })

  it('notifies shallow relation field watchers after relation payload assignment', async () => {
    const { form } = await createProfileForm()
    form.profile = createProfilePayload('profile-1')
    const profileIds: string[] = []
    const stop = watch(
      () => form.profile,
      profile => profileIds.push(profile._connect?.key.id ?? 'none'),
    )

    form.profile = createProfilePayload('profile-2')
    await nextTick()
    stop()

    expect(profileIds).toEqual(['profile-2'])
  })

  it('notifies shallow relation field watchers after array payload assignment', async () => {
    const { form } = await createPostsForm()
    form.posts = createPostsPayload('post-1')
    const postIds: string[] = []
    const stop = watch(
      () => form.posts,
      posts => postIds.push(posts?.[0]?._connect?.keys[0]?.id ?? 'none'),
    )

    form.posts = createPostsPayload('post-2')
    await nextTick()
    stop()

    expect(postIds).toEqual(['post-2'])
  })

  it('keeps raw relation payload reads reactive for assignment and nested mutation', async () => {
    const { form } = await createProfileForm()
    form.profile = createProfilePayload('profile-1')
    const rawProfileId = computed(() => form.$getRaw('profile')?._connect?.key.id ?? null)

    expect(rawProfileId.value).toBe('profile-1')

    form.profile = createProfilePayload('profile-2')
    await nextTick()

    expect(rawProfileId.value).toBe('profile-2')

    form.profile._connect.key.id = 'profile-3'
    await nextTick()

    expect(rawProfileId.value).toBe('profile-3')
  })
})
