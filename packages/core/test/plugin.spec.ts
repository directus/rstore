import type { Model, ModelDefaults, Plugin, StoreCore } from '@rstore/shared'
import { describe, expect, it, vi } from 'vitest'
import { setupPlugin } from '../src/plugin'

describe('setupPlugin', () => {
  it('should call plugin.setup with the correct hook', async () => {
    const mockHook = vi.fn()
    const mockStore: StoreCore<Model, ModelDefaults> = {
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
    })
  })

  it('should handle async plugin setup', async () => {
    const mockHook = vi.fn()
    const mockStore: StoreCore<Model, ModelDefaults> = {
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
    const mockStore: StoreCore<Model, ModelDefaults> = {
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
})
