import type { CollectionDefaults, StoreSchema } from './collection'
import type { BatchHookDefinitions } from './hooks/batch'
import type { CacheHookDefinitions } from './hooks/cache'
import type { FetchHookDefinitions } from './hooks/fetch'
import type { LifecycleHookDefinitions } from './hooks/lifecycle'
import type { MutationHookDefinitions } from './hooks/mutation'
import type { RealtimeHookDefinitions } from './hooks/realtime'
import type { SyncHookDefinitions } from './hooks/sync'

export * from './hooks/batch'
export * from './hooks/cache'
export * from './hooks/fetch'
export * from './hooks/lifecycle'
export * from './hooks/meta'
export * from './hooks/mutation'
export * from './hooks/realtime'
export * from './hooks/sync'

/**
 * Complete hook map supported by rstore plugins.
 */
export interface HookDefinitions<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
> extends
  LifecycleHookDefinitions<TSchema, TCollectionDefaults>,
  FetchHookDefinitions<TSchema, TCollectionDefaults>,
  MutationHookDefinitions<TSchema, TCollectionDefaults>,
  CacheHookDefinitions<TSchema, TCollectionDefaults>,
  RealtimeHookDefinitions<TSchema, TCollectionDefaults>,
  SyncHookDefinitions<TSchema, TCollectionDefaults>,
  BatchHookDefinitions<TSchema, TCollectionDefaults> {}

export type HookPayload = Parameters<HookDefinitions<StoreSchema, CollectionDefaults>[keyof HookDefinitions<StoreSchema, CollectionDefaults>]>[0]
