import type { Plugin } from '@rstore/shared'
import { expectReleased } from '#test-utils/gc'
import { createCoreStack } from '#test-utils/store/coreStack'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createRstoreDevtools } from '../src/runtime'

const schema = [{ name: 'todos' }]

/**
 * Probe plugin running its `init` hook before the devtools plugin `id`, so it
 * sees the store even when devtools rejects its construction.
 *
 * @param id Registration ID of the devtools plugin to precede.
 * @param onStore Receives a weak reference to the store under construction.
 */
function storeProbe(id: string, onStore: (store: WeakRef<object>) => void): Plugin {
  return {
    name: 'store-probe',
    before: { plugins: [`rstore-devtools:${id}`] },
    setup: ({ hook }) => {
      hook('init', ({ store }) => onStore(new WeakRef(store)))
    },
  }
}

describe('devtools store retention', () => {
  it('releases a disposed store while a modules subscription handle is held', async () => {
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)

    /** Keep the store out of the test driver's stack during collection. */
    async function observeThenDispose() {
      const stack = await createCoreStack({ factory: 'core', schema, remote: false, autoDispose: false, plugins: [runtime.plugin({ id: 'default' })] })
      const stop = runtime.subscribe(() => {}, runtime.listStores()[0]!.target, 'modules')
      stack.dispose()
      return { stop, store: new WeakRef<object>(stack.store) }
    }

    const { stop, store } = await observeThenDispose()
    expect(runtime.listStores()).toEqual([])
    await expectReleased(store)
    stop()
  })

  it.each([
    { cause: 'a duplicate registration ID', probeError: undefined, message: 'unique live registration' },
    { cause: 'an earlier init failure', probeError: new Error('probe failure'), message: 'probe failure' },
  ])('releases a store rejected by $cause without disposing the runtime', async ({ probeError, message }) => {
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const plugin = runtime.plugin({ id: 'default' })
    // Holds the `default` ID, so a second store's `attach` throws in `init`.
    await createCoreStack({ factory: 'core', schema, remote: false, plugins: [plugin] })

    let rejected: WeakRef<object> | undefined
    // Caught by hand: `expect(...).rejects` keeps the settled promise reachable.
    // The public Vue factory: its own cleanup must release the failed store.
    const failure = await createCoreStack({
      schema,
      remote: false,
      autoDispose: false,
      plugins: [storeProbe('default', (store) => {
        rejected = store
        if (probeError)
          throw probeError
      }), plugin],
    }).then(() => undefined, (error: Error) => error.message)
    expect(failure).toContain(message)

    expect(runtime.listStores()).toHaveLength(1)
    await expectReleased(rejected!)
  })
})
