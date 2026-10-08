import { createDeferred } from '#test-utils/deferred'
import { createHookable } from '@rstore/shared'
import { describe, expect, it, vi } from 'vitest'

describe('hookable asynchronous failure', () => {
  it('waits for rejection, stops later callbacks, and permits recovery after removal', async () => {
    const hooks = createHookable<{ test: () => string | Promise<string> }>()
    const gate = createDeferred<string>()
    const failure = new Error('remote hook failed')
    const log: string[] = []
    const removeFailing = hooks.hook('test', () => {
      log.push('held')
      return gate.promise
    })
    hooks.hook('test', () => {
      log.push('recovered')
      return 'recovered'
    })
    let settled = false
    // Capture rejection before releasing the callback, including during teardown.
    const outcome = hooks.callHook('test').then(
      () => undefined,
      error => error,
    )
    void outcome.then(() => {
      settled = true
    })
    try {
      await vi.waitFor(() => expect(log).toContain('held'))
      expect(log).toEqual(['held'])
      expect(settled, 'held callback must keep dispatch pending').toBe(false)
    }
    finally {
      gate.reject(failure)
      await vi.waitFor(() => expect(settled, 'rejected hook dispatch must settle').toBe(true))
    }

    expect(await outcome).toBe(failure)
    expect(log).toEqual(['held'])

    removeFailing()
    expect(await hooks.callHook('test')).toBe('recovered')
    expect(log).toEqual(['held', 'recovered'])
  })
})
