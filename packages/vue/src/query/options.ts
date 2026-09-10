import { deepEqual } from 'fast-equals'
import { klona } from 'klona'
import { watch } from 'vue'

/**
 * Observe raw query options while allowing an explicit load to consume a
 * pending watcher update before Vue schedules the watcher callback.
 */
export function watchQueryOptions<T>(getOptions: () => T, onChange: () => void) {
  let previousOptions = klona(getOptions())

  /** Record current options and report whether they changed. */
  function consume(): boolean {
    const value = getOptions()
    if (deepEqual(value, previousOptions)) {
      return false
    }
    previousOptions = klona(value)
    return true
  }

  watch(getOptions, () => {
    if (consume()) {
      onChange()
    }
  }, { deep: true })

  return { consume }
}
