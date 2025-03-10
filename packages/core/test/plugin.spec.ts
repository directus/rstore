import type { ModelDefaults, ModelList, Plugin, StoreCore } from '@rstore/shared'
import { describe, expect, it, vi } from 'vitest'
import { setupPlugin } from '../src/plugin'

describe('setupPlugin', () => {
  it('should call plugin.setup with the correct hook', async () => {
    const mockHook = vi.fn()
    const mockStore: StoreCore<ModelList, ModelDefaults> = {
      hooks: {
        hook: mockHook,
      },
    } as any

    const mockPlugin: Plugin = {
      name: 'test',
      setup: vi.fn(),
    }

    await setupPlugin(mockStore, mockPlugin)

    expect(mockPlugin.setup).toHaveBeenCalledWith({
      hook: mockHook,
      addModelDefaults: expect.any(Function),
    })
  })

  it('should handle async plugin setup', async () => {
    const mockHook = vi.fn()
    const mockStore: StoreCore<ModelList, ModelDefaults> = {
      hooks: {
        hook: mockHook,
      },
    } as any

    const mockPlugin: Plugin = {
      name: 'test',
      setup: vi.fn().mockResolvedValueOnce(undefined),
    }

    await setupPlugin(mockStore, mockPlugin)

    expect(mockPlugin.setup).toHaveBeenCalled()
  })

  it('should throw if plugin setup fails', async () => {
    const mockHook = vi.fn()
    const mockStore: StoreCore<ModelList, ModelDefaults> = {
      hooks: {
        hook: mockHook,
      },
    } as any

    const mockPlugin: Plugin = {
      name: 'test',
      setup: vi.fn().mockRejectedValueOnce(new Error('Setup failed')),
    }

    await expect(setupPlugin(mockStore, mockPlugin)).rejects.toThrow('Setup failed')
  })

  describe('addModelDefaults', () => {
    describe('addModelDefaults', () => {
      it('should add model defaults to the store', async () => {
        const mockHook = vi.fn()
        const mockStore: StoreCore<ModelList, ModelDefaults> = {
          hooks: {
            hook: mockHook,
          },
          modelDefaults: {},
        } as any

        const mockPlugin: Plugin = {
          name: 'test',
          setup: async ({ addModelDefaults }) => {
            addModelDefaults({
              computed: {
                test: () => 'test',
              },
            })
          },
        }

        await setupPlugin(mockStore, mockPlugin)

        expect(mockStore.modelDefaults.computed).toEqual({
          test: expect.any(Function),
        })
      })

      it('should merge model defaults with existing defaults', async () => {
        const mockHook = vi.fn()
        const mockStore: StoreCore<ModelList, ModelDefaults> = {
          hooks: {
            hook: mockHook,
          },
          modelDefaults: {
            computed: {
              existing: () => 'existing',
            },
          },
        } as any

        const mockPlugin: Plugin = {
          name: 'test',
          setup: async ({ addModelDefaults }) => {
            addModelDefaults({
              computed: {
                test: () => 'test',
              },
            })
          },
        }

        await setupPlugin(mockStore, mockPlugin)

        expect(mockStore.modelDefaults.computed).toEqual({
          existing: expect.any(Function),
          test: expect.any(Function),
        })
      })

      it('should overwrite existing model defaults if specified', async () => {
        const mockHook = vi.fn()
        const mockStore: StoreCore<ModelList, ModelDefaults> = {
          hooks: {
            hook: mockHook,
          },
          modelDefaults: {
            computed: {
              test: () => 'old',
            },
          },
        } as any

        const mockPlugin: Plugin = {
          name: 'test',
          setup: async ({ addModelDefaults }) => {
            addModelDefaults({
              computed: {
                test: () => 'new',
              },
            })
          },
        }

        await setupPlugin(mockStore, mockPlugin)

        expect(mockStore.modelDefaults.computed).toEqual({
          test: expect.any(Function),
        })
        expect(mockStore.modelDefaults.computed?.test({})).toBe('new')
      })
    })
  })
})
