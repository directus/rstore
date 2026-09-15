import type { KeyedMutationItemEntry, MutationItemEntry, MutationItemInput, MutationItemsInput } from '@rstore/shared'
import { describe, expectTypeOf, it } from 'vitest'

interface TodoInput {
  id: string
  title?: string
}

describe('mutation item entry contracts', () => {
  it('keeps optional-key entries and permissive inputs distinct', () => {
    const entry = { item: { id: '1' } } satisfies MutationItemEntry<TodoInput>
    const plain = { id: '2', title: 'Plain' } satisfies MutationItemInput<TodoInput>
    const entries = [entry, plain] satisfies MutationItemsInput<TodoInput>

    expectTypeOf(entry.item.id).toEqualTypeOf<string>()
    expectTypeOf(entries).toExtend<Array<MutationItemInput<TodoInput>>>()
  })

  it('requires a key for keyed many-entry payloads', () => {
    const entry = { key: 1, item: { id: '1' } } satisfies KeyedMutationItemEntry<TodoInput>

    expectTypeOf(entry.key).toEqualTypeOf<number>()
    // @ts-expect-error keyed entries require their explicit key
    const missingKey: KeyedMutationItemEntry<TodoInput> = { item: { id: '1' } }
    expectTypeOf(missingKey).toEqualTypeOf<KeyedMutationItemEntry<TodoInput>>()
  })
})
