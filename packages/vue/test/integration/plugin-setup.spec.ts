import type { Plugin } from '@rstore/shared'
import vm from 'node:vm'
import { createDeferred } from '#test-utils/deferred'
import { createVueStack } from '#test-utils/store/vueStack'
import { trackUnhandledRejections } from '#test-utils/unhandledRejections'
import { describe, expect, it } from 'vitest'

/** Store without a remote, so plugin setup is the only behavior under test. */
function setup(plugins: Plugin[]) {
  return createVueStack({ schema: [{ name: 'items' }], plugins, remote: false })
}

/** A gated `Promise<void>` built by another JS realm, with its settlers. */
interface ForeignDeferred {
  /** Native promise of the second realm, so not an instance of this realm's `Promise`. */
  promise: Promise<void>
  /** Fulfills {@link ForeignDeferred.promise}. */
  resolve: () => void
  /** Rejects {@link ForeignDeferred.promise} with `reason`. */
  reject: (reason: unknown) => void
}

/**
 * Builds a gated promise inside a second JS realm.
 *
 * A plugin returning it returns a supported `Promise<void>`, but one whose
 * constructor is not this realm's `Promise`. Chaining `.then` on it keeps the
 * foreign constructor, so the whole setup result stays cross-realm.
 */
function createForeignDeferred(): ForeignDeferred {
  return vm.runInNewContext(`(() => {
    let resolve
    let reject
    const promise = new Promise((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
  })()`)
}

/** Captures a rejected plugin setup without Vitest failing the process first. */
async function captureUnhandledRejections(fn: () => Promise<unknown>): Promise<unknown[]> {
  const vitestListeners = process.listeners('unhandledRejection')
  process.removeAllListeners('unhandledRejection')
  const tracker = trackUnhandledRejections()
  try {
    await fn()
    return await tracker.flush()
  }
  finally {
    tracker.stop()
    for (const listener of vitestListeners) {
      process.on('unhandledRejection', listener)
    }
  }
}

describe('plugin setup', () => {
  it('awaits async setup before later plugins and init', async () => {
    const gate = createDeferred<void>()
    const trace: string[] = []
    const pending = setup([
      {
        name: 'first',
        async setup() {
          trace.push('first:start')
          await gate.promise
          trace.push('first:end')
        },
      },
      {
        name: 'second',
        setup({ hook }) {
          trace.push('second')
          hook('init', () => {
            trace.push('init')
          })
        },
      },
    ])

    expect(trace).toEqual(['first:start'])
    gate.resolve()
    await pending

    expect(trace).toEqual(['first:start', 'first:end', 'second', 'init'])
  })

  it('awaits a foreign-realm setup promise before later plugins, defaults and init', async () => {
    const foreign = createForeignDeferred()
    const trace: string[] = []
    let setupResult: Promise<void> | undefined

    const pending = setup([
      {
        name: 'first',
        setup({ addCollectionDefaults }) {
          trace.push('first:start')
          setupResult = foreign.promise.then(() => {
            addCollectionDefaults({ computed: { late: () => 'late' } })
            trace.push('first:end')
          })
          return setupResult
        },
      },
      {
        name: 'second',
        setup({ hook }) {
          trace.push('second')
          hook('init', () => {
            trace.push('init')
          })
        },
      },
    ])

    const beforeRelease = [...trace]
    foreign.resolve()
    const stack = await pending

    // Assert only after settling the gate, so a regression still cleans up.
    expect(setupResult).not.toBeInstanceOf(Promise)
    expect(beforeRelease).toEqual(['first:start'])
    expect(trace).toEqual(['first:start', 'first:end', 'second', 'init'])
    // Defaults added after the foreign await still reach the collections.
    expect(stack.store.items.writeItem({ id: '1' }).late).toBe('late')
  })

  it('runs synchronous setups inside the createStore call', async () => {
    const trace: string[] = []

    const pending = setup([
      { name: 'first', setup: () => { trace.push('first') } },
      { name: 'second', setup: () => { trace.push('second') } },
    ])

    // No microtask boundary between plugins: a synchronous `setup` still runs
    // in the caller's synchronous context, where `useNuxtApp` resolves.
    expect(trace).toEqual(['first', 'second'])
    await pending
  })

  it('unregisters a hook through the teardown `hook` returns', async () => {
    const seen: string[] = []
    let off: (() => void) | undefined
    const { store } = await setup([
      {
        name: 'audit',
        setup({ hook }) {
          off = hook('beforeFetch', (payload: any) => {
            seen.push(payload.collection.name)
          })
        },
      },
      {
        name: 'remote',
        setup({ hook }) {
          hook('fetchMany', (payload: any) => payload.setResult([]))
        },
      },
    ])

    await (store as any).items.findMany({ fetchPolicy: 'fetch-only' })
    expect(seen).toEqual(['items'])

    off!()
    await (store as any).items.findMany({ fetchPolicy: 'fetch-only' })
    expect(seen).toEqual(['items'])
  })

  it('rejects out of createStore when a plugin setup throws', async () => {
    let error: unknown
    const unhandled = await captureUnhandledRejections(() => setup([
      {
        name: 'boom',
        async setup() {
          throw new Error('Setup failed')
        },
      },
    ]).catch((reason) => {
      error = reason
    }))

    expect(unhandled).toEqual([])
    expect(error).toEqual(new Error('Setup failed'))
  })

  it('rejects out of createStore when a foreign-realm setup rejects', async () => {
    const foreign = createForeignDeferred()
    const failure = new Error('Foreign setup failed')
    let error: unknown

    const unhandled = await captureUnhandledRejections(async () => {
      const pending = setup([
        { name: 'foreign-boom', setup: () => foreign.promise },
      ]).catch((reason) => {
        error = reason
      })
      foreign.reject(failure)
      await pending
    })

    expect(unhandled).toEqual([])
    expect(error).toBe(failure)
  })
})
