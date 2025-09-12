import { describe, expectTypeOf, test } from 'vitest'
import { withItemType } from '../src'

describe('typed collection', () => {
  test('withItemType', () => {
    interface MyObj {
      id: string
      name: string
    }

    const collection = withItemType<MyObj>().defineCollection({
      name: 'MyObj',
    })

    expectTypeOf(collection['~item']).toMatchTypeOf<MyObj>()
  })
})
