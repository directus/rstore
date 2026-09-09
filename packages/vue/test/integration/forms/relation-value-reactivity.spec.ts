import { describe, expect, it } from 'vitest'
import { computed, nextTick } from 'vue'
import { createPostsForm, createProfileForm } from '../../utils/form-relation-reactivity'

describe('createFormObject - relation payload reactivity', () => {
  it('re-evaluates a computed $value read after every relation operation', async () => {
    const { form, stack } = await createPostsForm()
    stack.write('posts', { id: 'post-1', title: 'First', authorId: 'user-1' })
    stack.write('posts', { id: 'post-2', title: 'Second', authorId: 'someone-else' })
    const titles = computed(() => form.posts.$value.map((post: any) => post.title))

    // Only the rows the relation index matches.
    expect(titles.value).toEqual(['First'])

    // The connected key resolves to the cached row, not to the partial item.
    form.posts.$connect({ id: 'post-2' })
    await nextTick()

    expect(titles.value).toEqual(['First', 'Second'])

    // `post-1` is only known to the cache, never to the local relation data.
    form.posts.$disconnect({ id: 'post-1' })
    await nextTick()

    expect(titles.value).toEqual(['Second'])
  })

  it('re-evaluates a computed $value read when the cache changes under it', async () => {
    const { form, stack } = await createProfileForm()
    const bio = computed(() => form.profile.$value?.bio ?? null)

    expect(bio.value).toBe(null)

    form.profile.$connect({ id: 'profile-1' })
    await nextTick()

    // The foreign key points at a row the cache does not hold yet.
    expect(form.profileId).toBe('profile-1')
    expect(bio.value).toBe(null)

    stack.write('profiles', { id: 'profile-1', bio: 'Hello' })
    await nextTick()

    expect(bio.value).toBe('Hello')
  })
})
