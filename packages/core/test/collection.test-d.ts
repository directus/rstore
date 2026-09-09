import { describe, expectTypeOf, test } from 'vitest'
import { withItemType } from '../src'

describe('typed collection', () => {
  test('withItemType', () => {
    interface MyObj {
      id: string
      name: string
    }

    withItemType<MyObj>().defineCollection({
      name: 'MyObj',
      getKey: (item) => {
        expectTypeOf(item).toEqualTypeOf<MyObj>()
        return item.id
      },
    })
  })
})
