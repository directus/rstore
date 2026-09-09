import { describe, expect, it } from 'vitest'
import { computed, nextTick } from 'vue'
import { createFormObject } from '../src'
import { createRelationStack } from './utils/relationStore'

/** Create a form with relation fields enabled, on a real store. */
async function createRelationForm(options: Record<string, any> = {}) {
  const stack = await createRelationStack()
  const form = createFormObject({
    defaultValues: () => ({
      id: 'user-1',
      name: 'John',
      profileId: null as string | null,
    }),
    submit: async () => undefined,
    ...stack.formBase,
    validateOnSubmit: false,
    ...options,
  }) as any
  return { form, stack }
}

describe('createFormObject - relation payload sanitation', () => {
  it('returns the live relation object payload from $getRaw', async () => {
    const { form } = await createRelationForm()
    form.profile = { _connect: { key: { id: 'profile-1' } } }
    const rawProfile = form.$getRaw('profile')
    const extraProfileId = computed(() => form.$getRaw('profile')?.extraKey?.id ?? null)

    expect(rawProfile).toBe(form.profile)
    expect(rawProfile.$connect).toBeTypeOf('function')

    rawProfile.extraKey = { id: 'profile-2' }
    await nextTick()

    expect(form.profile.extraKey.id).toBe('profile-2')
    expect(extraProfileId.value).toBe('profile-2')
    expect(form.$getRawData()).toEqual({
      id: 'user-1',
      name: 'John',
      profileId: null,
      profile: {
        _connect: { key: { id: 'profile-1' } },
        extraKey: { id: 'profile-2' },
      },
    })
    expect('$connect' in form.$getRawData().profile).toBe(false)
  })

  it('does not sanitize transform results through the live form proxy', async () => {
    let submittedData: any
    const payload = { _connect: { key: { id: 'profile-1' } } }
    const { form } = await createRelationForm({
      transformData: (data: any) => data,
      submit: async (data: any) => {
        submittedData = data
      },
      resetOnSuccess: false,
    })
    form.profile = payload
    const rawProfile = form.$getRaw('profile')

    await form.$submit()

    expect(form.$opLog.getAll()).toHaveLength(1)
    expect(form.$getRaw('profile')).toBe(rawProfile)
    expect(submittedData).toEqual({
      id: 'user-1',
      name: 'John',
      profileId: null,
      profile: payload,
    })
    expect(submittedData.profile).not.toBe(rawProfile)
    expect('$connect' in submittedData.profile).toBe(false)
  })

  it('strips relation array APIs from transformed submit data', async () => {
    let submittedData: any
    const { form } = await createRelationForm({
      transformData: (data: any) => ({ ...data }),
      submit: async (data: any) => {
        submittedData = data
      },
      resetOnSuccess: false,
    })

    form.posts = []
    const rawPosts = form.$getRaw('posts')
    rawPosts.push({ _connect: { keys: [{ id: 'post-1' }] } })

    await form.$submit()

    expect(submittedData.posts).toEqual([{ _connect: { keys: [{ id: 'post-1' }] } }])
    expect(submittedData.posts).not.toBe(rawPosts)
    expect('$connect' in submittedData.posts).toBe(false)
  })

  it('keeps plain relation payloads created by transformData', async () => {
    let submittedData: any
    const payload = { _connect: { key: { id: 'profile-1' } } }
    const { form } = await createRelationForm({
      transformData: (data: any) => ({ ...data, profile: payload }),
      submit: async (data: any) => {
        submittedData = data
      },
      resetOnSuccess: false,
    })

    await form.$submit()

    expect(submittedData).toEqual({
      id: 'user-1',
      name: 'John',
      profileId: null,
      profile: payload,
    })
    expect(submittedData.profile).not.toBe(payload)
    expect('$connect' in submittedData.profile).toBe(false)
  })

  it('keeps plain relation array payloads created by transformData', async () => {
    let submittedData: any
    const payload = [{ _connect: { keys: [{ id: 'post-1' }] } }]
    const { form } = await createRelationForm({
      transformData: (data: any) => ({ ...data, posts: payload }),
      submit: async (data: any) => {
        submittedData = data
      },
      resetOnSuccess: false,
    })

    await form.$submit()

    expect(submittedData.posts).toEqual(payload)
    expect(submittedData.posts).not.toBe(payload)
    expect('$connect' in submittedData.posts).toBe(false)
  })

  it('submits default relation operation payloads while keeping the relation API', async () => {
    let submittedData: any
    const payload = { _connect: { key: { id: 'profile-1' } } }
    const { form } = await createRelationForm({
      defaultValues: () => ({
        id: 'user-1',
        name: 'John',
        profileId: null,
        profile: payload,
      }),
      submit: async (data: any) => {
        submittedData = data
      },
      resetOnSuccess: false,
    })

    expect(form.profile.$connect).toBeTypeOf('function')
    expect(form.$getRaw('profile')).toEqual(payload)
    expect(form.$getRawData()).toEqual({
      id: 'user-1',
      name: 'John',
      profileId: null,
      profile: payload,
    })
    expect(form.$changedProps).toEqual({})

    await form.$submit()

    expect(submittedData.profile).toEqual(payload)
    expect(submittedData.profile).not.toBe(payload)
    expect('$connect' in submittedData.profile).toBe(false)
  })

  it('submits default relation operation arrays', async () => {
    let submittedData: any
    const payload = [{ _connect: { keys: [{ id: 'post-1' }] } }]
    const { form } = await createRelationForm({
      defaultValues: () => ({
        id: 'user-1',
        name: 'John',
        profileId: null,
        posts: payload,
      }),
      submit: async (data: any) => {
        submittedData = data
      },
      resetOnSuccess: false,
    })

    expect(form.posts.$connect).toBeTypeOf('function')
    expect(form.$getRaw('posts')).toEqual(payload)
    expect(form.posts.$value).toEqual([])

    await form.$submit()

    expect(submittedData.posts).toEqual(payload)
    expect(submittedData.posts).not.toBe(payload)
    expect('$connect' in submittedData.posts).toBe(false)
  })

  it('keeps the cache-resolved $value out of the submitted payload', async () => {
    let submittedData: any
    const { form, stack } = await createRelationForm({
      submit: async (data: any) => {
        submittedData = data
      },
      resetOnSuccess: false,
    })
    stack.write('profiles', { id: 'profile-1', bio: 'Hello' })
    stack.write('posts', { id: 'post-1', title: 'First', authorId: 'user-1' })

    form.profile.$connect({ id: 'profile-1' })

    // Resolved through the cache, so it carries fields only the cache knows.
    expect(form.profile.$value.bio).toBe('Hello')
    expect(form.posts.$value.map((post: any) => post.title)).toEqual(['First'])

    await form.$submit()

    // A submit sends the foreign key the connect wrote, never the rows the
    // relation resolves to.
    expect(submittedData).toEqual({ id: 'user-1', name: 'John', profileId: 'profile-1' })
  })
})
