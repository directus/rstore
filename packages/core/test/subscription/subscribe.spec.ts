import type { ResolvedCollection, StoreCore } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { subscribe } from '../../src/subscription/subscribe'

describe('subscribe', () => {
  let mockStore: StoreCore<any, any>
  let collection: ResolvedCollection

  beforeEach(() => {
    mockStore = {
      $hooks: createHooks(),
    } as any

    collection = {
      getKey: (item: any) => item.id,
    } as any
  })

  it('should call subscribe hook with correct context', async () => {
    const callHookSpy = vi.spyOn(mockStore.$hooks, 'callHook')

    await subscribe({
      store: mockStore,
      collection,
      subscriptionId: 'sub-1',
    })

    expect(callHookSpy).toHaveBeenCalledWith('subscribe', expect.objectContaining({
      store: mockStore,
      collection,
      subscriptionId: 'sub-1',
    }))
  })

  it('should include key in the context if provided', async () => {
    const callHookSpy = vi.spyOn(mockStore.$hooks, 'callHook')

    await subscribe({
      store: mockStore,
      collection,
      subscriptionId: 'sub-2',
      key: 'key-1',
    })

    expect(callHookSpy).toHaveBeenCalledWith('subscribe', expect.objectContaining({
      key: 'key-1',
    }))
  })

  it('should include findOptions in the context if provided', async () => {
    const callHookSpy = vi.spyOn(mockStore.$hooks, 'callHook')
    const findOptions = { filter: (item: any) => item.id === '1' }

    await subscribe({
      store: mockStore,
      collection,
      subscriptionId: 'sub-3',
      findOptions,
    })

    expect(callHookSpy).toHaveBeenCalledWith('subscribe', expect.objectContaining({
      findOptions,
    }))
  })

  it('should include meta in the context if provided', async () => {
    const callHookSpy = vi.spyOn(mockStore.$hooks, 'callHook')
    const meta = { custom: 'meta-data' } as any

    await subscribe({
      store: mockStore,
      collection,
      subscriptionId: 'sub-4',
      meta,
    })

    expect(callHookSpy).toHaveBeenCalledWith('subscribe', expect.objectContaining({
      meta,
    }))
  })

  it('should initialize meta if not provided', async () => {
    const callHookSpy = vi.spyOn(mockStore.$hooks, 'callHook')

    await subscribe({
      store: mockStore,
      collection,
      subscriptionId: 'sub-5',
    })

    expect(callHookSpy).toHaveBeenCalledWith('subscribe', expect.objectContaining({
      meta: {},
    }))
  })
})
