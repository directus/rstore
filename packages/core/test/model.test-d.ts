import { describe, expectTypeOf, test } from 'vitest'
import { defineItemType } from '../src'

describe('typed model', () => {
  test('defineItemType', () => {
    interface MyObj {
      id: string
      name: string
    }

    const model = defineItemType<MyObj>().model({
      name: 'MyObj',
    })

    expectTypeOf(model['~item']).toMatchTypeOf<MyObj>()
  })
})
