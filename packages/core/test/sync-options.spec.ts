import { createHooks } from '@rstore/shared'
import { describe, expect, it, vi } from 'vitest'
import { createSync } from '../src/sync'

describe('sync options', () => {
  it('passes cancellation through to sync hooks', async () => {
    const signal = new AbortController().signal
    const hooks = createHooks()
    const syncCallback = vi.fn()
    hooks.hook('sync', syncCallback)
    const store = {
      $hooks: hooks,
      $syncState: {
        isSyncing: false,
        loadedCollections: new Set<string>(),
        syncedCollections: new Set<string>(),
      },
    }
    const sync = createSync(() => store as any)

    await sync({ signal })

    expect(syncCallback).toHaveBeenCalledWith(expect.objectContaining({ signal }))
  })
})
