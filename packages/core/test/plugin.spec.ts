import { type CollectionDefaults, createHooks, type RegisteredPlugin, type StoreCore, type StoreSchema } from '@rstore/shared'
import { describe, expect, it, vi } from 'vitest'
import { setupPlugin } from '../src/plugin'

describe('setupPlugin', () => {
  it('should call plugin.setup', async () => {
    const mockHook = vi.fn()
    const mockStore: StoreCore<StoreSchema, CollectionDefaults> = {
      $hooks: {
        hook: mockHook,
      },
    } as any

    const mockPlugin: RegisteredPlugin = {
      name: 'test',
      hooks: {},
      setup: vi.fn(),
    }

    await setupPlugin(mockStore, mockPlugin)

    expect(mockPlugin.setup).toHaveBeenCalledWith({
      hook: expect.any(Function),
      addCollectionDefaults: expect.any(Function),
    })
  })

  it('should handle async plugin setup', async () => {
    const mockHook = vi.fn()
    const mockStore: StoreCore<StoreSchema, CollectionDefaults> = {
      $hooks: {
        hook: mockHook,
      },
    } as any

    const mockPlugin: RegisteredPlugin = {
      name: 'test',
      hooks: {},
      setup: vi.fn().mockResolvedValueOnce(undefined),
    }

    await setupPlugin(mockStore, mockPlugin)

    expect(mockPlugin.setup).toHaveBeenCalled()
  })

  it('should throw if plugin setup fails', async () => {
    const mockHook = vi.fn()
    const mockStore: StoreCore<StoreSchema, CollectionDefaults> = {
      $hooks: {
        hook: mockHook,
      },
    } as any

    const mockPlugin: RegisteredPlugin = {
      name: 'test',
      hooks: {},
      setup: vi.fn().mockRejectedValueOnce(new Error('Setup failed')),
    }

    await expect(setupPlugin(mockStore, mockPlugin)).rejects.toThrow('Setup failed')
  })

  describe('hook', () => {
    it('should register hook', async () => {
      const mockHook = vi.fn()
      const mockStore: StoreCore<StoreSchema, CollectionDefaults> = {
        $hooks: {
          hook: mockHook,
        },
      } as any

      const mockPlugin: RegisteredPlugin = {
        name: 'test',
        hooks: {},
        setup: ({ hook }) => {
          hook('fetchMany', () => {})
        },
      }

      await setupPlugin(mockStore, mockPlugin)

      expect(mockHook).toHaveBeenCalledWith('fetchMany', expect.any(Function), mockPlugin)
    })

    it('should filter hook with scopeId', async () => {
      const mockStore: StoreCore<StoreSchema, CollectionDefaults> = {
        $hooks: createHooks(),
      } as any

      const hookCallback = vi.fn()

      const mockPlugin: RegisteredPlugin = {
        name: 'test',
        hooks: {},
        scopeId: 'my-scope',
        setup: ({ hook }) => {
          hook('fetchMany', hookCallback)
        },
      }

      await setupPlugin(mockStore, mockPlugin)

      await mockStore.$hooks.callHook('fetchMany', {
        collection: {
          name: 'Todo',
          scopeId: 'my-scope',
        } as any,
      } as any)

      await mockStore.$hooks.callHook('fetchMany', {
        collection: {
          name: 'Message',
          scopeId: 'other-scope',
        } as any,
      } as any)

      expect(hookCallback).toHaveBeenCalledOnce()
      expect(hookCallback.mock.calls[0]![0].collection.name).toBe('Todo')
    })

    it('should not filter hook with scopeId with ignoreScope', async () => {
      const mockStore: StoreCore<StoreSchema, CollectionDefaults> = {
        $hooks: createHooks(),
      } as any

      const hookCallback = vi.fn()

      const mockPlugin: RegisteredPlugin = {
        name: 'test',
        hooks: {},
        scopeId: 'my-scope',
        setup: ({ hook }) => {
          hook('fetchMany', hookCallback, {
            ignoreScope: true,
          })
        },
      }

      await setupPlugin(mockStore, mockPlugin)

      await mockStore.$hooks.callHook('fetchMany', {
        collection: {
          name: 'Todo',
          scopeId: 'my-scope',
        } as any,
      } as any)

      await mockStore.$hooks.callHook('fetchMany', {
        collection: {
          name: 'Message',
          scopeId: 'other-scope',
        } as any,
      } as any)

      expect(hookCallback).toHaveBeenCalledTimes(2)
      expect(hookCallback.mock.calls[0]![0].collection.name).toBe('Todo')
      expect(hookCallback.mock.calls[1]![0].collection.name).toBe('Message')
    })

    it('should not filter hook with collection without scope', async () => {
      const mockStore: StoreCore<StoreSchema, CollectionDefaults> = {
        $hooks: createHooks(),
      } as any

      const hookCallback = vi.fn()

      const mockPlugin: RegisteredPlugin = {
        name: 'test',
        hooks: {},
        scopeId: 'my-scope',
        setup: ({ hook }) => {
          hook('fetchMany', hookCallback)
        },
      }

      await setupPlugin(mockStore, mockPlugin)

      await mockStore.$hooks.callHook('fetchMany', {
        collection: {
          name: 'Todo',
        } as any,
      } as any)

      await mockStore.$hooks.callHook('fetchMany', {
        collection: {
          name: 'Message',
        } as any,
      } as any)

      expect(hookCallback).toHaveBeenCalledTimes(2)
      expect(hookCallback.mock.calls[0]![0].collection.name).toBe('Todo')
      expect(hookCallback.mock.calls[1]![0].collection.name).toBe('Message')
    })

    it('should not filter hook with plugin without scope', async () => {
      const mockStore: StoreCore<StoreSchema, CollectionDefaults> = {
        $hooks: createHooks(),
      } as any

      const hookCallback = vi.fn()

      const mockPlugin: RegisteredPlugin = {
        name: 'test',
        hooks: {},
        setup: ({ hook }) => {
          hook('fetchMany', hookCallback)
        },
      }

      await setupPlugin(mockStore, mockPlugin)

      await mockStore.$hooks.callHook('fetchMany', {
        collection: {
          name: 'Todo',
          scopeId: 'my-scope',
        } as any,
      } as any)

      await mockStore.$hooks.callHook('fetchMany', {
        collection: {
          name: 'Message',
          scopeId: 'other-scope',
        } as any,
      } as any)

      expect(hookCallback).toHaveBeenCalledTimes(2)
      expect(hookCallback.mock.calls[0]![0].collection.name).toBe('Todo')
      expect(hookCallback.mock.calls[1]![0].collection.name).toBe('Message')
    })
  })

  describe('addCollectionDefaults', () => {
    describe('addCollectionDefaults', () => {
      it('should add collection defaults to the store', async () => {
        const mockHook = vi.fn()
        const mockStore: StoreCore<StoreSchema, CollectionDefaults> = {
          $hooks: {
            hook: mockHook,
          },
          $collectionDefaults: {},
        } as any

        const mockPlugin: RegisteredPlugin = {
          name: 'test',
          hooks: {},
          setup: async ({ addCollectionDefaults }) => {
            addCollectionDefaults({
              computed: {
                test: () => 'test',
              },
            })
          },
        }

        await setupPlugin(mockStore, mockPlugin)

        expect(mockStore.$collectionDefaults.computed).toEqual({
          test: expect.any(Function),
        })
      })

      it('should merge collection defaults with existing defaults', async () => {
        const mockHook = vi.fn()
        const mockStore: StoreCore<StoreSchema, CollectionDefaults> = {
          $hooks: {
            hook: mockHook,
          },
          $collectionDefaults: {
            computed: {
              existing: () => 'existing',
            },
          },
        } as any

        const mockPlugin: RegisteredPlugin = {
          name: 'test',
          hooks: {},
          setup: async ({ addCollectionDefaults }) => {
            addCollectionDefaults({
              computed: {
                test: () => 'test',
              },
            })
          },
        }

        await setupPlugin(mockStore, mockPlugin)

        expect(mockStore.$collectionDefaults.computed).toEqual({
          existing: expect.any(Function),
          test: expect.any(Function),
        })
      })

      it('should overwrite existing collection defaults if specified', async () => {
        const mockHook = vi.fn()
        const mockStore: StoreCore<StoreSchema, CollectionDefaults> = {
          $hooks: {
            hook: mockHook,
          },
          $collectionDefaults: {
            computed: {
              test: () => 'old',
            },
          },
        } as any

        const mockPlugin: RegisteredPlugin = {
          name: 'test',
          hooks: {},
          setup: async ({ addCollectionDefaults }) => {
            addCollectionDefaults({
              computed: {
                test: () => 'new',
              },
            })
          },
        }

        await setupPlugin(mockStore, mockPlugin)

        expect(mockStore.$collectionDefaults.computed).toEqual({
          test: expect.any(Function),
        })
        expect(mockStore.$collectionDefaults.computed!.test!({})).toBe('new')
      })
    })
  })
})
