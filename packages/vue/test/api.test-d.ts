import type { TestCollectionDefaults, TestSchema, UserItem } from '../../shared/test/types/collections'
import type { VueStore } from '../src'
import { describe, expectTypeOf, test } from 'vitest'
import { createStore, withItemType } from '../src'

declare const store: VueStore<TestSchema, TestCollectionDefaults>

describe('consumer API inference', () => {
  test('query builders preserve first nullability, many arrays, and relation arity', () => {
    const first = store.users.query(q => q.first('1'))
    const many = store.users.query(q => q.many({ include: { posts: true, profile: true } }))
    expectTypeOf(first.data.value).toBeNullable()
    expectTypeOf(first.data.value!.name).toEqualTypeOf<string>()
    expectTypeOf(many.data.value).toBeArray()
    expectTypeOf(many.data.value[0]!.posts).toBeArray()
    expectTypeOf(many.data.value[0]!.posts[0]!.title).toEqualTypeOf<string>()
    expectTypeOf(many.data.value[0]!.profile).toBeNullable()
    expectTypeOf(many.data.value[0]!.profile!.bio).toEqualTypeOf<string>()
    // @ts-expect-error collection item properties retain their declared type
    const invalid: number = first.data.value!.name
    void invalid
    // @ts-expect-error include must name a declared relation
    store.users.query(q => q.many({ include: { missing: true } }))
  })

  test('mutations and forms retain item field and result types', async () => {
    const created = await store.users.create({ name: 'Ada' })
    const updated = await store.users.update({ id: '1', email: null })
    expectTypeOf(created.name).toEqualTypeOf<string>()
    expectTypeOf(updated.email).toEqualTypeOf<string | null>()
    expectTypeOf(store.users.getKey(created)).toEqualTypeOf<string | number | null | undefined>()
    const form = store.users.createForm({ defaultValues: () => ({ name: 'Ada' }) })
    expectTypeOf(form.name).toEqualTypeOf<string | undefined>()
    expectTypeOf((await form.$submit()).name).toEqualTypeOf<string>()
    // @ts-expect-error form fields retain declared value types
    form.name = 42
    // @ts-expect-error update fields retain declared value types
    store.users.update({ id: '1', email: 42 })
    // @ts-expect-error unknown collections are not consumer APIs
    store.missing.findMany()
  })

  test('factory inference preserves a schema without a store type assertion', async () => {
    const users = withItemType<UserItem>().defineCollection({ name: 'users', getKey: item => item.id })
    const inferred = await createStore({ schema: [users], plugins: [] })
    expectTypeOf((await inferred.users.findFirst('1'))!.name).toEqualTypeOf<string>()
    // @ts-expect-error key arguments cannot be arbitrary objects
    inferred.users.findFirst({ key: { id: '1' } })
  })
})
