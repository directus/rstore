import type { CollectionDefaults, WrappedItem } from '@rstore/shared'
import type { UpdateFormObject } from '../src'
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
type UserUpdateFormObject = Awaited<ReturnType<UserWrappedItem['$updateForm']>>
type IsAssignableToApiUpdateFormObject = UserUpdateFormObject extends UpdateFormObject<typeof collection, CollectionDefaults, Schema> ? true : false
type HasOnChange = '$onChange' extends keyof UserUpdateFormObject ? true : false
type IsCallable = UserUpdateFormObject extends (...args: any[]) => Promise<User> ? true : false

describe('wrapped item typing', () => {
  test('$updateForm return type', () => {
    expectTypeOf<IsAssignableToApiUpdateFormObject>().toEqualTypeOf<true>()
    expectTypeOf<HasOnChange>().toEqualTypeOf<true>()
    expectTypeOf<IsCallable>().toEqualTypeOf<true>()
  })
})
