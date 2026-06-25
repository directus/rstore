import type { CollectionDefaults, WrappedItem } from '@rstore/shared'
import type { CreateFormObject, UpdateFormObject } from '../src'
import { describe, expectTypeOf, test } from 'vitest'
import { withItemType } from '../src'

interface User {
  id: number
  name: string
}

// eslint-disable-next-line unused-imports/no-unused-vars
const collection = withItemType<User>().defineCollection({
  name: 'users',
})

type Schema = [typeof collection]

type UserWrappedItem = WrappedItem<typeof collection, CollectionDefaults, Schema>
type UserCreateFormObject = CreateFormObject<typeof collection, CollectionDefaults, Schema>
type UserUpdateFormObject = Awaited<ReturnType<UserWrappedItem['$updateForm']>>
type IsAssignableToApiUpdateFormObject = UserUpdateFormObject extends UpdateFormObject<typeof collection, CollectionDefaults, Schema> ? true : false
type HasGetRaw = '$getRaw' extends keyof UserCreateFormObject & keyof UserUpdateFormObject ? true : false
type HasGetRawData = '$getRawData' extends keyof UserCreateFormObject & keyof UserUpdateFormObject ? true : false
type HasOnChange = '$onChange' extends keyof UserUpdateFormObject ? true : false
type IsCallable = UserUpdateFormObject extends (...args: any[]) => Promise<User> ? true : false

describe('wrapped item typing', () => {
  test('$updateForm return type', () => {
    expectTypeOf<IsAssignableToApiUpdateFormObject>().toEqualTypeOf<true>()
    expectTypeOf<HasGetRaw>().toEqualTypeOf<true>()
    expectTypeOf<HasGetRawData>().toEqualTypeOf<true>()
    expectTypeOf<HasOnChange>().toEqualTypeOf<true>()
    expectTypeOf<IsCallable>().toEqualTypeOf<true>()

    const createForm = null as any as UserCreateFormObject
    const updateForm = null as any as UserUpdateFormObject

    expectTypeOf(createForm.$getRaw('name')).toEqualTypeOf<string | undefined>()
    expectTypeOf(updateForm.$getRaw('name')).toEqualTypeOf<string | undefined>()
    expectTypeOf(createForm.$getRawData().name).toEqualTypeOf<string | undefined>()
    expectTypeOf(updateForm.$getRawData({ clone: true }).name).toEqualTypeOf<string | undefined>()
  })
})
