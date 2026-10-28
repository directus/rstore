import { describe, expect, it, vi } from 'vitest'
import { createDirectusRstorePlugin } from '../packages/directus/src'
import { createMonospaceRstorePlugin } from '../packages/monospace/src'
import { capturePluginHooks } from './utils/connectorPlugin'

describe('connector plugin test harness', () => {
  it('captures hooks from Directus and Monospace plugin factories', () => {
    const directus = capturePluginHooks(createDirectusRstorePlugin({
      client: { request: vi.fn() } as any,
      scopeId: 'test-scope',
    }))
    const monospace = capturePluginHooks(createMonospaceRstorePlugin({
      client: {
        createMany: vi.fn(),
        createOne: vi.fn(),
        deleteMany: vi.fn(),
        deleteOne: vi.fn(),
        readMany: vi.fn(),
        readOne: vi.fn(),
        updateMany: vi.fn(),
        updateOne: vi.fn(),
      } as any,
      scopeId: 'test-scope',
    }))

    for (const hooks of [directus, monospace]) {
      expect(hooks.fetchFirst).toEqual(expect.any(Function))
      expect(hooks.fetchMany).toEqual(expect.any(Function))
      expect(hooks.createItem).toEqual(expect.any(Function))
      expect(hooks.updateItem).toEqual(expect.any(Function))
      expect(hooks.deleteItem).toEqual(expect.any(Function))
    }
  })
})
