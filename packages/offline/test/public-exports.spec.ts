import { describe, expect, it, vi } from 'vitest'
import { createOfflinePlugin, triggerOfflineSync } from '../src'
import { stubLocalStorage } from './utils/plugin'

describe('public offline exports', () => {
  it('exports the offline plugin factory from the package root', () => {
    expect(createOfflinePlugin()).toMatchObject({
      name: 'offline',
      category: 'local',
    })
  })

  it('allows apps that own reconnect handling to trigger sync themselves', async () => {
    const signal = new AbortController().signal
    const store = { $sync: vi.fn(async () => {}) }

    await triggerOfflineSync(store, { signal })

    expect(store.$sync).toHaveBeenCalledWith({ signal })
  })

  it('does not register the built-in reconnect hook when disabled', () => {
    vi.stubGlobal('window', {})
    stubLocalStorage()
    const hook = vi.fn()

    createOfflinePlugin({ reconnect: false }).setup({
      hook,
      addCollectionDefaults: () => {},
    } as any)

    // Init still prepares IndexedDB and runs version cleanup. The third init
    // hook is the browser reconnect listener, intentionally absent here.
    expect(hook.mock.calls.filter(([name]) => name === 'init')).toHaveLength(2)
    vi.unstubAllGlobals()
  })
})
