import { deepEqual } from 'fast-equals'
import { klona } from 'klona'
import { watch } from 'vue'

/**
 * Detached copy of options without function values.
 *
 * Function options (such as `filter`) are local cache-read callbacks. Options
 * getters rebuild inline callbacks on every read, JSON query ids drop them and
 * SSR payloads cannot carry them, so they never identify a query, page,
 * confirmation or subscription.
 */
export function toSerializableOptions<T>(value: T): T {
  if (Array.isArray(value))
    return value.map(item => typeof item === 'function' ? undefined : toSerializableOptions(item)) as T
  if (value != null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    const copy: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (typeof item !== 'function')
        copy[key] = toSerializableOptions(item)
    }
    return copy as T
  }
  return klona(value)
}

/**
 * Whether two options describe the same query, ignoring function values.
 * Shared by the options watcher, live page subscriptions, push currency and
 * saved confirmation so every layer agrees on what "same options" means.
 */
export function equalFindOptions(a: unknown, b: unknown): boolean {
  return deepEqual(toSerializableOptions(a), toSerializableOptions(b))
}

/**
 * Observe raw query options while allowing an explicit load to consume a
 * pending watcher update before Vue schedules the watcher callback.
 *
 * `onChange(true)` reports a serializable change, which identifies a different
 * query. `onChange(false)` reports that only function values changed: the
 * query, its pages and their subscriptions stay the same, but local callbacks
 * may select different rows, so pages reload in place.
 */
export function watchQueryOptions<T>(getOptions: () => T, onChange: (reset: boolean) => void) {
  // klona keeps function references, so function changes stay detectable.
  let previousOptions = klona(getOptions())

  /** Record current options and classify how they changed. */
  function classify(): 'options' | 'functions' | false {
    const value = getOptions()
    const change = !equalFindOptions(value, previousOptions)
      ? 'options'
      : deepEqual(value, previousOptions) ? false : 'functions'
    previousOptions = klona(value)
    return change
  }

  watch(getOptions, () => {
    const change = classify()
    if (change) {
      onChange(change === 'options')
    }
  }, { deep: true })

  return {
    /** Record current options and report whether they identify a different query. */
    consume: () => classify() === 'options',
  }
}
