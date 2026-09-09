import type {
  FieldConflict as SharedFieldConflict,
  FieldTimestamps as SharedFieldTimestamps,
  FieldTimestampValue as SharedFieldTimestampValue,
  MergeResult as SharedMergeResult,
  TextChange as SharedTextChange,
  TextMergeConflict as SharedTextMergeConflict,
  TextMergeResult as SharedTextMergeResult,
} from '@rstore/shared'
import type {
  FieldConflict as RootFieldConflict,
  FieldTimestamps as RootFieldTimestamps,
  FieldTimestampValue as RootFieldTimestampValue,
  MergeResult as RootMergeResult,
  TextChange as RootTextChange,
  TextMergeConflict as RootTextMergeConflict,
  TextMergeResult as RootTextMergeResult,
} from '../src'
import { describe, expectTypeOf, test } from 'vitest'
import { mergeItemFields } from '../src'

/** Item shape used to verify merge result inference. */
interface Todo {
  /** Stable item key. */
  id: string
  /** Editable item title. */
  title: string
}

describe('CRDT type re-exports', () => {
  test('keeps root type exports equal to Shared', () => {
    expectTypeOf<RootFieldTimestampValue>().toEqualTypeOf<SharedFieldTimestampValue>()
    expectTypeOf<RootFieldTimestamps>().toEqualTypeOf<SharedFieldTimestamps>()
    expectTypeOf<RootFieldConflict>().toEqualTypeOf<SharedFieldConflict>()
    expectTypeOf<RootMergeResult<Todo>>().toEqualTypeOf<SharedMergeResult<Todo>>()
    expectTypeOf<RootTextChange>().toEqualTypeOf<SharedTextChange>()
    expectTypeOf<RootTextMergeConflict>().toEqualTypeOf<SharedTextMergeConflict>()
    expectTypeOf<RootTextMergeResult>().toEqualTypeOf<SharedTextMergeResult>()
  })

  test('infers mergeItemFields result from its item arguments', () => {
    const local: Todo = { id: '1', title: 'Local' }
    const remote: Todo = { id: '1', title: 'Remote' }
    const result = mergeItemFields(local, remote, {}, {})

    expectTypeOf(result).toEqualTypeOf<SharedMergeResult<Todo>>()
  })
})
