import { createDeferred } from '#test-utils/deferred'
import { createTestStore as createStore } from '#test-utils/store/integrationStore'

/**
 * Store with a `messages` collection whose `fetchMany` returns immediately until
 * `defer()` is called, after which it returns a deferred controlled by the test.
 * Lets a test warm the cache first, then hold the background fetch in flight.
 */
export async function createDeferrableStore(immediateResult: Array<{ id: string, text: string }> = []) {
  const deferred = createDeferred<Array<{ id: string, text: string }>>()
  let deferring = false
  const store = await createStore({
    schema: [
      {
        name: 'messages',
        hooks: {
          fetchMany: () => deferring ? deferred.promise : immediateResult,
        },
      },
    ],
    plugins: [],
  })
  return {
    store,
    deferred,
    defer: () => {
      deferring = true
    },
  }
}
