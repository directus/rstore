import { describe, expectTypeOf, test } from 'vitest'
import { defineItemType } from '../src'

describe('typed model type', () => {
  test('defineItemType', () => {
    interface MyObj {
      id: string
      name: string
    }

    const modelType = defineItemType<MyObj>().modelType({
      name: 'MyObj',
    })

    expectTypeOf(modelType['~item']).toMatchTypeOf<MyObj>()
  })
})
