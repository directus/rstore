import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it } from 'vitest'

describe('relation edge cases', () => {
  it('matches every field of a composite relation key', async () => {
    const { store } = await createVueStack({
      schema: [
        {
          name: 'parents',
          getKey: (item: any) => `${item.tenantId}:${item.id}`,
          relations: {
            children: {
              many: true,
              to: { children: { on: { tenantId: 'tenantId', parentId: 'id' } } },
            },
          },
        },
        { name: 'children' },
      ],
      data: { parents: [{ tenantId: 't1', id: 'p1' }] },
    })
    store.children.writeItem({ id: 'match', tenantId: 't1', parentId: 'p1' })
    store.children.writeItem({ id: 'wrong-tenant', tenantId: 't2', parentId: 'p1' })
    store.children.writeItem({ id: 'wrong-parent', tenantId: 't1', parentId: 'p2' })

    const parent = await store.parents.findFirst({ filter: (item: any) => item.tenantId === 't1' && item.id === 'p1' })

    expect(parent.children.map((child: any) => child.id)).toEqual(['match'])
  })

  it('does not join nullish source fields to nullish target fields', async () => {
    const { store } = await createVueStack({
      schema: [
        {
          name: 'parents',
          relations: { children: { many: true, to: { children: { on: { tenantId: 'tenantId' } } } } },
        },
        { name: 'children' },
      ],
      data: { parents: [{ id: 'p1', tenantId: null }] },
    })
    store.children.writeItem({ id: 'c1', tenantId: null })

    const parent = await store.parents.findFirst('p1')

    expect(parent.children).toEqual([])
  })

  it('updates missing to-one and to-many relations when cache rows arrive', async () => {
    const { store } = await createVueStack({
      schema: [
        {
          name: 'users',
          relations: {
            profile: { to: { profiles: { on: { userId: 'id' } } } },
            posts: { many: true, to: { posts: { on: { authorId: 'id' } } } },
          },
        },
        { name: 'profiles' },
        { name: 'posts' },
      ],
      data: { users: [{ id: 'u1', name: 'Ada' }] },
    })
    const user = await store.users.findFirst('u1')

    expect(user.profile).toBeUndefined()
    expect(user.posts).toEqual([])

    store.profiles.writeItem({ id: 'profile-1', userId: 'u1', bio: 'Hello' })
    store.posts.writeItem({ id: 'post-1', authorId: 'u1', title: 'First' })

    expect(user.profile.bio).toBe('Hello')
    expect(user.posts.map((post: any) => post.title)).toEqual(['First'])
  })
})
