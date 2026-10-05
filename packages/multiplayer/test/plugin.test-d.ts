import type { createMultiplayerPlugin } from '@rstore/multiplayer'
import type { CollectionDefaults, CustomCacheWriteMetadata, FieldConflict, FieldTimestamps, FieldTimestampValue, HookDefinitions, Hooks, StoreSchema } from '@rstore/shared'
import { describe, expectTypeOf, it } from 'vitest'

describe('@rstore/multiplayer augmentation', () => {
  it('adds the stamps to the cache write metadata', () => {
    expectTypeOf<CustomCacheWriteMetadata['fieldTimestamps']>().toEqualTypeOf<FieldTimestamps | undefined>()
    expectTypeOf<CustomCacheWriteMetadata['deletedAt']>().toEqualTypeOf<FieldTimestampValue | undefined>()
  })

  it('declares the cacheConflict hook', () => {
    type Payload = Parameters<HookDefinitions<StoreSchema, CollectionDefaults>['cacheConflict']>[0]
    expectTypeOf<Payload['conflicts']>().toEqualTypeOf<FieldConflict[]>()
    expectTypeOf<Payload['key']>().toEqualTypeOf<string | number>()
    // Store hooks accept the augmented name (the hook names stay generic in the shared declarations).
    expectTypeOf<'cacheConflict'>().toExtend<Parameters<Hooks<StoreSchema, CollectionDefaults>['hook']>[0]>()
  })

  it('accepts conflict policies by name or function', () => {
    type Options = NonNullable<Parameters<typeof createMultiplayerPlugin>[0]>
    expectTypeOf<{ lww: { conflictPolicy: 'remote-wins' } }>().toExtend<Options>()
    expectTypeOf<{ lww: { conflictPolicy: () => { value: 1 } } }>().toExtend<Options>()
    expectTypeOf<{ lww: { conflictPolicy: 'newest' } }>().not.toExtend<Options>()
  })
})
