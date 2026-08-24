import type { MutationSpecialProps } from '@rstore/shared'
import { ref } from 'vue'

/**
 * Wrap a mutation with reactive loading, error, and timing telemetry while preserving its call
 * signature and synchronous or asynchronous return behavior.
 */
export function wrapMutation<TMutation extends (...args: any[]) => unknown>(
  mutation: TMutation,
): TMutation & MutationSpecialProps {
  const $loading = ref(false)
  const $error = ref<Error | null>(null)
  const $time = ref(0)
  const wrappedMutation = ((...args: Parameters<TMutation>): ReturnType<TMutation> => {
    $loading.value = true
    const start = performance.now()
    try {
      const result = mutation(...args)
      // Preserve synchronous return values while keeping telemetry active until promise-like
      // results settle.
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        return Promise.resolve(result)
          .then((value) => {
            $error.value = null
            return value
          }, (error) => {
            $error.value = error instanceof Error ? error : new Error(String(error))
            throw error
          })
          .finally(() => {
            $loading.value = false
            $time.value = performance.now() - start
          }) as ReturnType<TMutation>
      }
      $error.value = null
      $loading.value = false
      $time.value = performance.now() - start
      return result as ReturnType<TMutation>
    }
    catch (error) {
      $error.value = error instanceof Error ? error : new Error(String(error))
      $loading.value = false
      $time.value = performance.now() - start
      throw error
    }
  }) as TMutation

  return new Proxy(wrappedMutation, {
    get(target, property) {
      if (property === '$loading') {
        return $loading.value
      }
      if (property === '$error') {
        return $error.value
      }
      if (property === '$time') {
        return $time.value
      }
      return Reflect.get(target, property)
    },
    set(target, property, value) {
      if (property === '$error') {
        $error.value = value
        return true
      }
      return Reflect.set(target, property, value)
    },
  }) as TMutation & MutationSpecialProps
}
