import type { CacheInspectionRow, CacheLayer, ResolvedCollection } from '@rstore/shared'
import type { CacheRuntime } from './types'
import { unref } from 'vue'
import { resolveInspectionKey } from './inspectionKeys'

/** Borrowed committed values and active overlays for one inspection traversal. */
interface EffectiveSources {
  /** Committed values followed by active overlay states in precedence order. */
  states: Record<string, any>[]
  /** Active overlays, retaining their flags and deletion-key representation. */
  layers: CacheLayer[]
}

/** Resolve membership sources without materializing their row values. */
function sources(ctx: CacheRuntime, name: string): EffectiveSources {
  const layers = (ctx.layers[name]?.value ?? []).filter(layer => !layer.skip)
  return { states: [ctx.state.collections[name]?.value ?? {}, ...layers.map(layer => layer.state)], layers }
}

/** Recognize addresses ordered numerically by ordinary object enumeration. */
function isArrayIndex(address: string): boolean {
  const index = Number(address)
  return Number.isInteger(index) && index >= 0 && index < 4_294_967_295 && String(index) === address
}

/** Enumerate own addresses without reading values or allocating all row keys. */
function* ownAddresses(state: Record<string, unknown>): Generator<string> {
  for (const address in state) {
    if (Object.hasOwn(state, address))
      yield address
  }
}

/** Match deletion keys using the same canonical addresses as object properties. */
function isDeleted(layers: CacheLayer[], address: string): boolean {
  return layers.some((layer) => {
    if (layer.deletedItems.has(address))
      return true
    const numeric = Number(address)
    return String(numeric) === address && layer.deletedItems.has(numeric)
  })
}

/** Merge key streams in object order using only one cursor per state source. */
function* effectiveAddresses({ states, layers }: EffectiveSources): Generator<string> {
  const cursors = states.map((state) => {
    const iterator = ownAddresses(state)
    return { iterator, next: iterator.next() }
  })
  while (true) {
    let selected = -1
    for (let index = 0; index < cursors.length; index++) {
      const candidate = cursors[index]!.next
      if (candidate.done)
        continue
      if (selected === -1 || (isArrayIndex(candidate.value)
        && (!isArrayIndex(cursors[selected]!.next.value!) || Number(candidate.value) < Number(cursors[selected]!.next.value!)))) {
        selected = index
      }
    }
    if (selected === -1)
      return
    const cursor = cursors[selected]!
    const address = cursor.next.value!
    // Earlier sources already emitted this address; deletion applies after all
    // overlays, so a later write never revives an active layer's deleted key.
    // Non-enumerable properties never emitted an earlier key and cannot hide
    // an enumerable overlay field during descriptor merging.
    const duplicate = states.some((state, index) => index < selected && Object.getOwnPropertyDescriptor(state, address)?.enumerable)
    if (!duplicate && !isDeleted(layers, address))
      yield address
    cursor.next = cursor.iterator.next()
  }
}

/** Count effective membership without touching values or retaining merged rows. */
export function countEffectiveRows(ctx: CacheRuntime, name: string): number {
  let count = 0
  for (const _address of effectiveAddresses(sources(ctx, name)))
    count++
  return count
}

/** Merge diagnostic descriptors within a fixed bound, preserving overlay precedence. */
function mergeValues(values: unknown[], layer: CacheLayer): { value: object, truncated: boolean } {
  const states = values.filter(value => value != null).map(value => new Object(value) as Record<string, unknown>)
  const value = Object.create(null)
  let fields = 0
  let truncated = false
  // One overflow entry lets the default projector report its own truncation;
  // row metadata also preserves omission for consumers with larger budgets.
  for (const key of effectiveAddresses({ states, layers: [] })) {
    if (fields++ >= 1001) {
      truncated = true
      break
    }
    for (let index = states.length - 1; index >= 0; index--) {
      const descriptor = Object.getOwnPropertyDescriptor(states[index]!, key)
      if (descriptor?.enumerable) {
        Object.defineProperty(value, key, { ...descriptor, configurable: true })
        break
      }
    }
  }
  Object.defineProperty(value, '$layer', { enumerable: true, configurable: true, value: layer })
  return { value, truncated }
}

/** Resolve pulled rows only; bounded overlay descriptors explicitly report omitted fields. */
export function* readEffectiveRows(ctx: CacheRuntime, collection: ResolvedCollection): Iterable<CacheInspectionRow> {
  const input = sources(ctx, collection.name)
  const keys = ctx.publicKeys?.get(collection.name)
  for (const address of effectiveAddresses(input)) {
    const values = Object.hasOwn(input.states[0]!, address) ? [input.states[0]![address]] : []
    let topLayer: CacheLayer | undefined
    for (const layer of input.layers) {
      if (Object.hasOwn(layer.state, address)) {
        values.push(layer.state[address])
        topLayer = layer
      }
    }
    const merged = topLayer ? mergeValues(values, topLayer) : { value: unref(values[0]), truncated: false }
    yield { key: keys?.get(address) ?? resolveInspectionKey(collection, address, merged.value), value: merged.value, ...(merged.truncated ? { truncated: true } : {}) }
  }
}
