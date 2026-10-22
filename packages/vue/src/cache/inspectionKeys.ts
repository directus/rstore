import type { ResolvedCollection } from '@rstore/shared'
import type { CacheRuntime } from './types'
import { unref } from 'vue'

/** Resolve known scalar identity from data descriptors, never application key callbacks. */
export function resolveInspectionKey(_collection: ResolvedCollection | undefined, address: string, value: unknown): string | number {
  if (value !== null && typeof value === 'object') {
    try {
      // These conventional identity fields preserve useful numeric/string hints.
      // An accessor or opaque custom key must fall back to the stored address.
      for (const field of ['$overrideKey', 'id', '__id']) {
        const descriptor = Object.getOwnPropertyDescriptor(value, field)
        if (descriptor && !('value' in descriptor))
          return address
        const key = descriptor?.value
        if (key == null)
          continue
        return (typeof key === 'string' || typeof key === 'number') && String(key) === address ? key : address
      }
    }
    catch {
      // Hostile reflection cannot turn diagnostic identity into application work.
    }
  }
  return address
}

/** Keep only committed address representation, never another copy of row data. */
export function rememberInspectionKey(ctx: CacheRuntime, name: string, key: string | number): void {
  if (!ctx.publicKeys)
    return
  let keys = ctx.publicKeys.get(name)
  if (!keys) {
    keys = new Map()
    ctx.publicKeys.set(name, keys)
  }
  keys.set(String(key), key)
}

/** Forget a deleted address so subsequent writes cannot inherit stale identity. */
export function forgetInspectionKey(ctx: CacheRuntime, name: string, key: string | number): void {
  const keys = ctx.publicKeys?.get(name)
  keys?.delete(String(key))
  if (keys?.size === 0) {
    ctx.publicKeys?.delete(name)
  }
}

/** Rebuild address hints after hydration without adding serialized metadata. */
export function rebuildInspectionKeys(ctx: CacheRuntime): void {
  if (!ctx.publicKeys)
    return
  ctx.publicKeys.clear()
  for (const name in ctx.state.collections) {
    const collection = ctx.getStore().$collections.find(candidate => candidate.name === name)
    const state = ctx.state.collections[name]!.value
    for (const address in state) {
      rememberInspectionKey(ctx, name, resolveInspectionKey(collection, address, unref(state[address])))
    }
  }
}
