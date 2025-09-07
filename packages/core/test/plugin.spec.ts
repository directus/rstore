import { createHooks, type ModelDefaults, type RegisteredPlugin, type StoreCore, type StoreSchema } from '@rstore/shared'
import { describe, expect, it, vi } from 'vitest'
import { setupPlugin } from '../src/plugin'

describe('setupPlugin', () => {
  it('should call plugin.setup', async () => {
    const mockHook = vi.fn()
    const mockStore: StoreCore<StoreSchema, ModelDefaults> = {
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
      addModelDefaults: expect.any(Function),
    })
  })

  it('should handle async plugin setup', async () => {
    const mockHook = vi.fn()
    const mockStore: StoreCore<StoreSchema, ModelDefaults> = {
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
    const mockStore: StoreCore<StoreSchema, ModelDefaults> = {
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
      const mockStore: StoreCore<StoreSchema, ModelDefaults> = {
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
      const mockStore: StoreCore<StoreSchema, ModelDefaults> = {
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
        model: {
          name: 'Todo',
          scopeId: 'my-scope',
        } as any,
      } as any)

      await mockStore.$hooks.callHook('fetchMany', {
        model: {
          name: 'Message',
          scopeId: 'other-scope',
        } as any,
      } as any)

      expect(hookCallback).toHaveBeenCalledOnce()
      expect(hookCallback.mock.calls[0]![0].model.name).toBe('Todo')
    })

    it('should not filter hook with scopeId with ignoreScope', async () => {
      const mockStore: StoreCore<StoreSchema, ModelDefaults> = {
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
        model: {
          name: 'Todo',
          scopeId: 'my-scope',
        } as any,
      } as any)

      await mockStore.$hooks.callHook('fetchMany', {
        model: {
          name: 'Message',
          scopeId: 'other-scope',
        } as any,
      } as any)

      expect(hookCallback).toHaveBeenCalledTimes(2)
      expect(hookCallback.mock.calls[0]![0].model.name).toBe('Todo')
      expect(hookCallback.mock.calls[1]![0].model.name).toBe('Message')
    })

    it('should not filter hook with model without scope', async () => {
      const mockStore: StoreCore<StoreSchema, ModelDefaults> = {
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
        model: {
          name: 'Todo',
        } as any,
      } as any)

      await mockStore.$hooks.callHook('fetchMany', {
        model: {
          name: 'Message',
        } as any,
      } as any)

      expect(hookCallback).toHaveBeenCalledTimes(2)
      expect(hookCallback.mock.calls[0]![0].model.name).toBe('Todo')
      expect(hookCallback.mock.calls[1]![0].model.name).toBe('Message')
    })

    it('should not filter hook with plugin without scope', async () => {
      const mockStore: StoreCore<StoreSchema, ModelDefaults> = {
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
        model: {
          name: 'Todo',
          scopeId: 'my-scope',
        } as any,
      } as any)

      await mockStore.$hooks.callHook('fetchMany', {
        model: {
          name: 'Message',
          scopeId: 'other-scope',
        } as any,
      } as any)

      expect(hookCallback).toHaveBeenCalledTimes(2)
      expect(hookCallback.mock.calls[0]![0].model.name).toBe('Todo')
      expect(hookCallback.mock.calls[1]![0].model.name).toBe('Message')
    })
  })

  describe('addModelDefaults', () => {
    describe('addModelDefaults', () => {
      it('should add model defaults to the store', async () => {
        const mockHook = vi.fn()
        const mockStore: StoreCore<StoreSchema, ModelDefaults> = {
          $hooks: {
            hook: mockHook,
          },
          $modelDefaults: {},
        } as any

        const mockPlugin: RegisteredPlugin = {
          name: 'test',
          hooks: {},
          setup: async ({ addModelDefaults }) => {
            addModelDefaults({
              computed: {
                test: () => 'test',
              },
            })
          },
        }

        await setupPlugin(mockStore, mockPlugin)

        expect(mockStore.$modelDefaults.computed).toEqual({
          test: expect.any(Function),
        })
      })

      it('should merge model defaults with existing defaults', async () => {
        const mockHook = vi.fn()
        const mockStore: StoreCore<StoreSchema, ModelDefaults> = {
          $hooks: {
            hook: mockHook,
          },
          $modelDefaults: {
            computed: {
              existing: () => 'existing',
            },
          },
        } as any

        const mockPlugin: RegisteredPlugin = {
          name: 'test',
          hooks: {},
          setup: async ({ addModelDefaults }) => {
            addModelDefaults({
              computed: {
                test: () => 'test',
              },
            })
          },
        }

        await setupPlugin(mockStore, mockPlugin)

        expect(mockStore.$modelDefaults.computed).toEqual({
          existing: expect.any(Function),
          test: expect.any(Function),
        })
      })

      it('should overwrite existing model defaults if specified', async () => {
        const mockHook = vi.fn()
        const mockStore: StoreCore<StoreSchema, ModelDefaults> = {
          $hooks: {
            hook: mockHook,
          },
          $modelDefaults: {
            computed: {
              test: () => 'old',
            },
          },
        } as any

        const mockPlugin: RegisteredPlugin = {
          name: 'test',
          hooks: {},
          setup: async ({ addModelDefaults }) => {
            addModelDefaults({
              computed: {
                test: () => 'new',
              },
            })
          },
        }

        await setupPlugin(mockStore, mockPlugin)

        expect(mockStore.$modelDefaults.computed).toEqual({
          test: expect.any(Function),
        })
        expect(mockStore.$modelDefaults.computed!.test!({})).toBe('new')
      })
    })
  })
})
