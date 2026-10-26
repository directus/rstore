import type { CustomHookMeta, FindFirstOptions, ResolvedCollection, StoreCore } from '@rstore/shared'
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
 * Shared by the options watcher, push currency and saved confirmation.
 * Subscription identity additionally excludes local fetch/cache controls.
 */
export function equalFindOptions(a: unknown, b: unknown): boolean {
  return deepEqual(toSerializableOptions(a), toSerializableOptions(b))
}

/** Resolved snapshot identifying one subscription's server read. */
export interface SubscriptionIdentity {
  /** Collection identity bounds the resolved read. */
  collection: ResolvedCollection<any, any, any>
  /** Detached resolved options retained for opening and closing the transport. */
  findOptions: FindFirstOptions<any, any, any>
}

/** Resolve detached caller options once for subscription comparison and opening. */
export function resolveSubscriptionIdentity(store: StoreCore<any, any>, collection: ResolvedCollection<any, any, any>, options: FindFirstOptions<any, any, any>, many: boolean, meta: CustomHookMeta): SubscriptionIdentity {
  const findOptions = store.$resolveFindOptions(collection, klona(options), many, meta)
  return { collection, findOptions }
}

/** Compare resolved server reads without local fetch/cache controls. */
export function equalSubscriptionOptions(a: FindFirstOptions<any, any, any>, b: FindFirstOptions<any, any, any>): boolean {
  /** Remove client controls; resultMode still shapes pushed-result representation. */
  const serverOptions = ({ fetchPolicy, dedupe, experimentalGarbageCollection, fetchOptions, ...options }: FindFirstOptions<any, any, any>) => options
  return equalFindOptions(serverOptions(a), serverOptions(b))
}

/** Compare collection identity and resolved subscription options. */
export function equalSubscriptionIdentity(a: SubscriptionIdentity | undefined, b: SubscriptionIdentity | undefined): boolean {
  if (a === b)
    return true
  if (!a || !b)
    return false
  return a.collection === b.collection && equalSubscriptionOptions(a.findOptions, b.findOptions)
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
