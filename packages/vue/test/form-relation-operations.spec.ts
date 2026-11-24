import type { StoreSchema } from '@rstore/shared'
import { createDeferred } from '#test-utils/deferred'
import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createFormObject } from '../src'
import { relationCollection } from './utils/form'
import { createRelationStack } from './utils/relationStore'

/** Build a user form against the shared real relation cache. */
async function createUserForm() {
  const stack = await createRelationStack()
  const form = createFormObject({
    defaultValues: () => ({ id: 'user-1', profileId: null as string | null }),
    submit: async () => undefined,
    validateOnSubmit: false,
    ...stack.formBase,
  }) as any
  return { form, stack }
}

describe('form relation operations', () => {
  it('initializes no-store relation defaults while preserving relation operations', () => {
    const form = createFormObject({
      collection: relationCollection(),
      defaultValues: () => ({ id: 'user-1', profileId: null }),
      submit: async () => undefined,
      validateOnSubmit: false,
    }) as any

    expect(form.profile.$value).toBeNull()
    expect(form.posts.$value).toEqual([])

    form.profile.$connect({ id: 'profile-1' })
    form.posts.$set([{ id: 'post-1' }])

    expect(form.profileId).toBe('profile-1')
    expect(form.$opLog.getOptimized()).toEqual([
      expect.objectContaining({ field: 'profile', type: 'connect', newValue: { id: 'profile-1' } }),
      expect.objectContaining({ field: 'posts', type: 'set', newValue: [{ id: 'post-1' }] }),
    ])
  })

  it('round-trips to-one connect and disconnect through undo and redo', async () => {
    const { form, stack } = await createUserForm()
    stack.write('profiles', { id: 'profile-1', bio: 'Hello' })

    form.profile.$connect({ id: 'profile-1' })
    expect(form.profileId).toBe('profile-1')
    expect(form.profile.$value.bio).toBe('Hello')

    form.$opLog.undo()
    expect(form.profileId).toBeNull()
    expect(form.profile.$value).toBeNull()

    form.$opLog.redo()
    expect(form.profileId).toBe('profile-1')
    expect(form.profile.$value.bio).toBe('Hello')

    form.profile.$disconnect()
    expect(form.profileId).toBeNull()
    expect(form.profile.$value).toBeNull()

    form.$opLog.undo()
    expect(form.profileId).toBe('profile-1')
    expect(form.profile.$value.bio).toBe('Hello')
  })

  it('projects connect, targeted disconnect, disconnect-all, and set into a to-many value', async () => {
    const { form, stack } = await createUserForm()
    stack.write('posts', { id: 'post-1', authorId: 'user-1', title: 'Cached' })
    stack.write('posts', { id: 'post-2', authorId: 'other', title: 'Connected' })
    stack.write('posts', { id: 'post-3', authorId: 'other', title: 'Set' })

    expect(form.posts.$value.map((item: any) => item.id)).toEqual(['post-1'])
    form.posts.$connect({ id: 'post-2' })
    expect(form.posts.$value.map((item: any) => item.id)).toEqual(['post-1', 'post-2'])

    form.posts.$disconnect({ id: 'post-1' })
    expect(form.posts.$value.map((item: any) => item.id)).toEqual(['post-2'])
    form.$opLog.undo()
    expect(form.posts.$value.map((item: any) => item.id)).toEqual(['post-1', 'post-2'])
    form.$opLog.redo()
    expect(form.posts.$value.map((item: any) => item.id)).toEqual(['post-2'])

    form.posts.$disconnect()
    expect(form.posts.$value).toEqual([])
    form.posts.$set([{ id: 'post-3' }])
    expect(form.posts.$value.map((item: any) => item.title)).toEqual(['Set'])
    form.$opLog.undo()
    expect(form.posts.$value).toEqual([])
    form.$opLog.redo()
    expect(form.posts.$value.map((item: any) => item.id)).toEqual(['post-3'])
  })

  it('disconnects the targeted row of a to-many relation and keeps the others', async () => {
    const { form, stack } = await createUserForm()
    stack.write('posts', { id: 'post-1', authorId: 'user-1', title: 'First' })
    stack.write('posts', { id: 'post-2', authorId: 'user-1', title: 'Second' })
    expect(form.posts.$value.map((item: any) => item.id)).toEqual(['post-1', 'post-2'])

    form.posts.$disconnect({ id: 'post-2' })
    expect(form.posts.$value.map((item: any) => item.title)).toEqual(['First'])
    expect(form.$opLog.getOptimized()).toEqual([
      expect.objectContaining({ field: 'posts', type: 'disconnect', oldValue: { id: 'post-2' } }),
    ])

    form.$opLog.undo()
    expect(form.posts.$value.map((item: any) => item.id)).toEqual(['post-1', 'post-2'])
  })

  it('keeps an undone to-many connect once the acknowledged data holds both rows', async () => {
    const gate = createDeferred<void>()
    onTestFinished(() => gate.resolve())
    const stack = await createRelationStack()
    stack.write('posts', { id: 'post-1', authorId: 'user-1', title: 'First' })
    stack.write('posts', { id: 'post-2', authorId: 'other', title: 'Second' })
    const submittedOperations: any[] = []
    const form = createFormObject({
      defaultValues: () => ({ id: 'user-1', profileId: null as string | null }),
      validateOnSubmit: false,
      submit: async (_data, { formOperations }) => {
        submittedOperations.push(formOperations)
        await gate.promise
        // The backend accepted the connect, so the cache now resolves the
        // previously connected row and the newly connected one.
        stack.write('posts', { id: 'post-2', authorId: 'user-1', title: 'Second' })
      },
      ...stack.formBase,
    }) as any

    expect(form.posts.$value.map((item: any) => item.id)).toEqual(['post-1'])
    form.posts.$connect({ id: 'post-2' })
    expect(form.posts.$value.map((item: any) => item.id)).toEqual(['post-1', 'post-2'])

    const pending = form.$submit()
    expect(form.$opLog.undo()).toBe(true)
    gate.resolve()
    await pending

    expect(form.posts.$value.map((item: any) => item.title)).toEqual(['First'])
    expect(form.$opLog.getOptimized()).toEqual([
      expect.objectContaining({ field: 'posts', type: 'disconnect', oldValue: { id: 'post-2' } }),
    ])
    await form.$submit()
    expect(submittedOperations[1]).toEqual([
      expect.objectContaining({ field: 'posts', type: 'disconnect', oldValue: { id: 'post-2' } }),
    ])
  })

  it('maps every composite relation field and restores them through undo and redo', async () => {
    const schema: StoreSchema = [
      {
        name: 'users',
        relations: {
          identity: {
            to: { identities: { on: { tenantId: 'identityTenantId', accountId: 'identityAccountId' } } },
          },
        },
      },
      { name: 'identities', getKey: (item: any) => `${item.tenantId}:${item.accountId}` },
    ]
    const stack = await createVueStack({ schema, remote: false })
    stack.store.identities.writeItem({ tenantId: 'tenant-1', accountId: 'account-1', label: 'Ada' })
    const form = createFormObject({
      defaultValues: () => ({ identityTenantId: null, identityAccountId: null }),
      submit: async () => undefined,
      collection: stack.collection('users'),
      store: stack.store,
      validateOnSubmit: false,
    }) as any

    form.identity.$connect({ tenantId: 'tenant-1', accountId: 'account-1' })
    expect([form.identityTenantId, form.identityAccountId, form.identity.$value.label])
      .toEqual(['tenant-1', 'account-1', 'Ada'])

    form.$opLog.undo()
    expect([form.identityTenantId, form.identityAccountId, form.identity.$value]).toEqual([null, null, null])
    form.$opLog.redo()
    expect([form.identityTenantId, form.identityAccountId, form.identity.$value.label])
      .toEqual(['tenant-1', 'account-1', 'Ada'])
  })

  it('keeps an undone to-one disconnect after the submit is acknowledged', async () => {
    const gate = createDeferred<void>()
    onTestFinished(() => gate.resolve())
    const stack = await createRelationStack()
    stack.write('profiles', { id: 'profile-1', bio: 'Hello' })
    let savedProfileId: string | null = 'profile-1'
    const form = createFormObject({
      defaultValues: () => ({ id: 'user-1', profileId: savedProfileId }),
      validateOnSubmit: false,
      submit: async (data) => {
        await gate.promise
        savedProfileId = data.profileId ?? null
      },
      ...stack.formBase,
    }) as any

    form.profile.$disconnect()
    expect(form.profileId).toBeNull()
    const pending = form.$submit()
    form.$opLog.undo()
    expect(form.profile.$value.bio).toBe('Hello')
    gate.resolve()
    await pending

    expect(savedProfileId).toBeNull()
    // A to-one disconnect does not record the item it removed, so the undo is
    // kept as an edit of the foreign key the relation projects onto.
    expect(form.profile.$value.bio).toBe('Hello')
    expect(form.$changedProps).toEqual({ profileId: ['profile-1', null] })
    expect(form.$opLog.getOptimized()).toEqual([
      expect.objectContaining({ field: 'profileId', type: 'set', newValue: 'profile-1', oldValue: null }),
    ])
    await form.$submit()
    expect(savedProfileId).toBe('profile-1')
    expect(form.$hasChanges()).toBe(false)
  })
})
