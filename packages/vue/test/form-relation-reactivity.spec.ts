import { describe, expect, it } from 'vitest'
import { computed, nextTick, watch } from 'vue'
import { createFormObject } from '../src'

/** Return a test collection with profile and posts relations. */
function createUserCollection() {
  return {
    name: 'User',
    normalizedRelations: {
      profile: {
        many: false,
        to: [{ collection: 'Profile', on: { 'Profile.id': 'User.profileId' } }],
      },
      posts: {
        many: true,
        to: [{ collection: 'Post', on: { 'Post.authorId': 'User.id' } }],
      },
    },
  }
}

/** Create a relation payload that is easy to inspect through Vue effects. */
function createProfilePayload(id: string) {
  return { _connect: { key: { id } } }
}

/** Create a consumer-specific to-many relation payload. */
function createPostsPayload(id: string) {
  return [{ _connect: { keys: [{ id }] } }]
}

/** Create a form with the profile relation enabled. */
function createProfileForm(initialProfile?: any) {
  return createFormObject({
    defaultValues: () => ({
      id: 'user-1',
      name: 'John',
      profileId: null as string | null,
      ...(initialProfile === undefined ? {} : { profile: initialProfile }),
    }),
    submit: async () => undefined,
    collection: createUserCollection() as any,
    store: { $collections: [], $cache: {} } as any,
    validateOnSubmit: false,
  }) as any
}

/** Create a form with a many relation enabled. */
function createPostsForm(initialPosts?: any[], submit: any = async () => undefined) {
  return createFormObject({
    defaultValues: () => ({
      id: 'user-1',
      name: 'John',
      posts: initialPosts,
    }),
    submit,
    collection: createUserCollection() as any,
    store: { $collections: [], $cache: {} } as any,
    validateOnSubmit: false,
  }) as any
}

describe('createFormObject - relation payload reactivity', () => {
  it('updates computed payload reads after relation payload assignment', async () => {
    const form = createProfileForm()
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
    const form = createPostsForm()
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
    const form = createPostsForm(undefined, async (data: any, { formOperations }: any) => {
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
    const form = createProfileForm()
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
    const form = createPostsForm()
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
    const form = createProfileForm()
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

  it('returns detached cloned raw relation data', () => {
    const form = createProfileForm()
    form.profile = createProfilePayload('profile-1')
    const clonedData = form.$getRawData({ clone: true })

    clonedData.profile._connect.key.id = 'profile-2'

    expect(form.profile._connect.key.id).toBe('profile-1')
    expect(form.$getRaw('profile')).toEqual(createProfilePayload('profile-1'))
  })

  it('returns detached cloned raw relation arrays', () => {
    const form = createPostsForm()
    form.posts = createPostsPayload('post-1')
    const clonedData = form.$getRawData({ clone: true })

    clonedData.posts[0]._connect.keys[0].id = 'post-2'

    expect(form.posts[0]._connect.keys[0].id).toBe('post-1')
    expect(form.$getRaw('posts')).toEqual(createPostsPayload('post-1'))
  })

  it('keeps restored relation payloads reactive after undo and redo, and clears them on reset', async () => {
    const initialPayload = createProfilePayload('profile-1')
    const nextPayload = createProfilePayload('profile-2')
    const form = createProfileForm()
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
    const form = createPostsForm()
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

  it('keeps default many-relation arrays as submitted payload', () => {
    const posts = [
      { id: 'post-1', title: 'First' },
      { id: 'post-2', title: 'Second' },
    ]
    const form = createPostsForm(posts)

    expect(form._$postsData).toEqual([])
    expect(form.$getRaw('posts')).toEqual(posts)
    expect(form.$getRawData()).toEqual({ id: 'user-1', name: 'John', posts })

    form.posts.$set([{ id: 'post-3', title: 'Third' }])

    expect(form._$postsData).toEqual([{ id: 'post-3', title: 'Third' }])
    expect(form.$getRaw('posts')).toEqual(posts)
  })

  it('keeps default relation objects as submitted payload', () => {
    const profile = { id: 'profile-1', name: 'Ada' }
    const form = createProfileForm(profile)

    expect(form._$profileData).toBe(null)
    expect(form.$getRaw('profile')).toEqual(profile)
    expect(form.$getRawData()).toEqual({ id: 'user-1', name: 'John', profileId: null, profile })
  })
})
