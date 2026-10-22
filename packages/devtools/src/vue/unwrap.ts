import { computed, customRef, isRef, ref, toRaw, toRef, unref } from 'vue'

/** Read value getter identity from a public Vue constructor without evaluating its value. */
function valueGetter(source: object): (() => unknown) | undefined {
  let current: object | null = source
  for (let depth = 0; current && depth < 10; depth++) {
    const descriptor = Object.getOwnPropertyDescriptor(current, 'value')
    if (descriptor)
      return descriptor.get
    current = Object.getPrototypeOf(current)
  }
}

/** Vue ref variants expose known getters; a loose __v_isRef flag alone grants no accessor authority. */
const genuineValueGetters = new Set([
  valueGetter(ref()),
  valueGetter(computed(() => undefined)),
  valueGetter(customRef(() => ({ get: () => undefined, set: () => {} }))),
  valueGetter(toRef({ value: undefined }, 'value')),
  valueGetter(toRef(() => undefined)),
].filter((getter): getter is () => unknown => getter !== undefined))

/** Reject application accessors that imitate Vue's internal flag properties. */
function unsafeFlags(value: object): boolean {
  let current: object | null = value
  let valueResolved = false
  for (let depth = 0; current && depth < 10; depth++) {
    const descriptor = Object.getOwnPropertyDescriptor(current, 'value')
    if (!valueResolved && descriptor) {
      valueResolved = true
      if (!('value' in descriptor) && (!descriptor.get || !genuineValueGetters.has(descriptor.get)))
        return true
    }
    for (const flag of ['__v_isRef', '__v_raw']) {
      const descriptor = Object.getOwnPropertyDescriptor(current, flag)
      if (descriptor && !('value' in descriptor))
        return true
      // A source-owned raw pointer is application data, not a Vue proxy's virtual raw flag.
      if (flag === '__v_raw' && descriptor)
        return true
    }
    current = Object.getPrototypeOf(current)
  }
  // An unexamined prototype tail cannot authorize Vue's subsequent property reads.
  return current !== null
}

/** Unwrap normal Vue refs/proxies while leaving arbitrary application getters to projection markers. */
export function unwrapVueValue(value: unknown): unknown {
  if (value !== null && (typeof value === 'object' || typeof value === 'function') && unsafeFlags(value))
    return value
  const unwrapped = isRef(value) ? unref(value) : value
  if (unwrapped !== null && (typeof unwrapped === 'object' || typeof unwrapped === 'function') && unsafeFlags(unwrapped))
    return unwrapped
  return toRaw(unwrapped)
}

/** Identify Vue refs without probing arbitrary application flag accessors. */
export function isInspectionRef(value: unknown): boolean {
  return !(value !== null && (typeof value === 'object' || typeof value === 'function') && unsafeFlags(value)) && isRef(value)
}
