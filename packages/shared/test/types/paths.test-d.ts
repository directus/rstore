import type { FilterNotStartingWith, FilterStartsWith, Path, PathValue } from '@rstore/shared'
import { describe, expectTypeOf, it } from 'vitest'

/**
 * `Path` / `PathValue` type the field paths of `get`, `set`, collection
 * `fields` and the `modifyItem` hook argument, so a regression there is
 * invisible at runtime and breaks every consumer at compile time.
 */

interface Address {
  city: string
  zip?: string
}

interface Company {
  name: string
  address: Address
}

interface Employee {
  id: string
  age: number
  address: Address
  company?: Company
  tags: string[]
  scores: Array<{ value: number }>
  meta: Record<string, { count: number }>
  createdAt: Date
}

describe('Path on nested objects', () => {
  it('accepts every segment of a nested path and rejects unknown ones', () => {
    expectTypeOf<'address'>().toExtend<Path<Employee>>()
    expectTypeOf<'address.city'>().toExtend<Path<Employee>>()
    expectTypeOf<'address.country'>().not.toExtend<Path<Employee>>()
    expectTypeOf<'city'>().not.toExtend<Path<Employee>>()
  })

  it('resolves the value of a nested path', () => {
    expectTypeOf<PathValue<Employee, 'address'>>().toEqualTypeOf<Address>()
    expectTypeOf<PathValue<Employee, 'address.city'>>().toEqualTypeOf<string>()
    expectTypeOf<PathValue<Employee, 'age'>>().toEqualTypeOf<number>()
  })
})

describe('Path on optional fields', () => {
  it('walks through an optional object', () => {
    expectTypeOf<'company.address.city'>().toExtend<Path<Employee>>()
    expectTypeOf<PathValue<Employee, 'company.address.city'>>().toEqualTypeOf<string>()
  })

  it('keeps undefined in the value of an optional leaf', () => {
    expectTypeOf<PathValue<Employee, 'address.zip'>>().toEqualTypeOf<string | undefined>()
  })
})

describe('Path on arrays and index signatures', () => {
  it('indexes arrays by number', () => {
    expectTypeOf<'tags.0'>().toExtend<Path<Employee>>()
    expectTypeOf<'scores.2.value'>().toExtend<Path<Employee>>()
    expectTypeOf<PathValue<Employee, 'tags.0'>>().toEqualTypeOf<string>()
    expectTypeOf<PathValue<Employee, 'scores.2.value'>>().toEqualTypeOf<number>()
  })

  it('accepts any key of an index signature', () => {
    expectTypeOf<'meta.anything.count'>().toExtend<Path<Employee>>()
    expectTypeOf<PathValue<Employee, 'meta.anything.count'>>().toEqualTypeOf<number>()
  })

  it('treats a Date as a leaf', () => {
    expectTypeOf<PathValue<Employee, 'createdAt'>>().toEqualTypeOf<Date>()
    // Walking into browser-native objects would explode the path union.
    expectTypeOf<'createdAt.getTime'>().not.toExtend<Path<Employee>>()
  })
})

describe('Path on recursive types', () => {
  interface TreeNode {
    id: string
    parent?: TreeNode
    children: TreeNode[]
  }

  it('truncates a self-referencing branch instead of hitting the instantiation depth limit', () => {
    // The `AnyIsEqual` guard in `types/utils.ts` cuts a branch as soon as its
    // value type was already traversed; without it `tsc` reports an excessively
    // deep instantiation. The documented cost is that paths *through* a
    // recursive field are not typed.
    expectTypeOf<Path<TreeNode>>().toEqualTypeOf<'id' | 'parent' | 'children' | `children.${number}`>()
    expectTypeOf<'parent.id'>().not.toExtend<Path<TreeNode>>()
    expectTypeOf<'children.0.id'>().not.toExtend<Path<TreeNode>>()
    expectTypeOf<PathValue<TreeNode, 'parent'>>().toEqualTypeOf<TreeNode | undefined>()
  })
})

describe('special key filters', () => {
  interface WrappedShape {
    id: string
    title: string
    $collection: string
    $getKey: () => string
    _$relationData: unknown
  }

  it('splits the public and the rstore-private surface of an item', () => {
    // Same split as `isPublicKey` at runtime: `pickNonSpecialProps` types its
    // result with these two helpers, so they must agree with it.
    expectTypeOf<FilterNotStartingWith<keyof WrappedShape, '$' | '_$'>>().toEqualTypeOf<'id' | 'title'>()
    expectTypeOf<FilterStartsWith<keyof WrappedShape, '$'>>().toEqualTypeOf<'$collection' | '$getKey'>()
  })

  it('types the picked object like the runtime helpers return it', () => {
    expectTypeOf<Pick<WrappedShape, FilterNotStartingWith<keyof WrappedShape, '$' | '_$'>>>().toEqualTypeOf<{
      id: string
      title: string
    }>()
  })
})
