import type { CreateStoreCoreOptions } from '../src/store'
import { type Cache, createHooks, type Model, type ModelDefaults, type Plugin } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStoreCore } from '../src/store'

describe('createStoreCore', () => {
  let options: CreateStoreCoreOptions

  beforeEach(() => {
    options = {
      cache: {} as Cache,
      model: {} as Model,
      modelDefaults: {} as ModelDefaults,
      plugins: [],
      hooks: {
        callHookSync: vi.fn(),
        callHook: vi.fn(),
        hook: vi.fn(),
      } as any,
      findDefaults: {},
    }
  })

  it('should create a store with default options', async () => {
    const store = await createStoreCore(options)
    expect(store).toBeDefined()
    expect(store.cache).toBe(options.cache)
    expect(store.model).toBeDefined()
    expect(store.modelDefaults).toEqual({})
    expect(store.plugins).toEqual([])
    expect(store.hooks).toBe(options.hooks)
    expect(store.findDefaults).toEqual({})
  })

  it('should call setup for each plugin', async () => {
    const plugin1 = {
      name: 'test1',
      setup: vi.fn(),
    } as Plugin
    const plugin2 = {
      name: 'test2',
      setup: vi.fn(),
    } as Plugin
    options.plugins = [plugin1, plugin2]

    await createStoreCore(options)

    expect(plugin1.setup).toHaveBeenCalled()
    expect(plugin2.setup).toHaveBeenCalled()
  })

  it('should call init hook after store creation', async () => {
    await createStoreCore(options)
    expect(options.hooks.callHook).toHaveBeenCalledWith('init', expect.anything())
  })

  it('calls custom field parse', async () => {
    const model: Model = {
      Test: {
        name: 'Test',
        fields: {
          name: {
            parse: (value: any) => value.toUpperCase(),
          },
        },
      },
    }
    options.model = model
    options.hooks = createHooks()

    const store = await createStoreCore(options)
    const item = { name: 'test' }

    store.processItemParsing(store.model.Test, item)

    expect(item.name).toBe('TEST')
  })
})
