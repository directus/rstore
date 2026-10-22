import type { PreviewValue, ProjectionResult } from '../protocol/preview'
import type { ProjectionBudget } from './budget'
import { fitString, jsonBytes } from './budget'
import { ProjectionBudgetExceededError } from './errors'
import { childPath, dataProperty, ownKeys } from './values'

/** Limits for one detached value and optional shared reply allowance. */
export interface ProjectionOptions {
  /** Encoded bytes per preview, default 32 KiB. */
  maxBytes?: number
  /** Maximum nesting depth, default 10. */
  maxDepth?: number
  /** Maximum visited child entries, default 1,000. */
  maxEntries?: number
  /** Encoded bytes per string, default 8 KiB. */
  maxStringBytes?: number
  /** Optional framework adapter; identity is recorded after unwrapping. */
  unwrap?: (value: unknown) => unknown
  /** Shared allowance across independently projected values. */
  budget?: ProjectionBudget
}

/** Preview builder result, including omission discovered below the current node. */
interface NodeResult {
  /** Detached projected node. */
  value: PreviewValue
  /** Exact encoded node size. */
  bytes: number
  /** Information omitted from this node or a descendant. */
  truncated: boolean
}

/** Project one value without retaining sources, invoking getters, or serializing source objects. */
export function projectValue(input: unknown, options: ProjectionOptions = {}): ProjectionResult {
  const maxBytes = Math.min(options.maxBytes ?? 32768, options.budget?.remainingBytes ?? Infinity)
  const maxDepth = options.maxDepth ?? 10
  const maxEntries = options.maxEntries ?? 1000
  const maxString = options.maxStringBytes ?? 8192
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 4)
    throw new ProjectionBudgetExceededError()
  if ([maxDepth, maxEntries, maxString].some(limit => !Number.isSafeInteger(limit) || limit < 0))
    throw new RangeError('Projection limits must be nonnegative integers')
  const seen = new WeakMap<object, string>()
  const accessor = Symbol('accessor')
  const inaccessible = Symbol('inaccessible')
  let entries = 0

  /** Encode an already detached node; insufficient space becomes the smallest JSON marker. */
  function bounded(value: PreviewValue, allowance: number, truncated = false): NodeResult {
    const bytes = jsonBytes(value)
    return bytes <= allowance ? { value, bytes, truncated } : { value: null, bytes: 4, truncated: true }
  }

  /** Build a bounded diagnostic marker without including hostile source error text. */
  function marker(kind: 'accessor' | 'unsupported' | 'truncated', reason: string, path: string, allowance: number): NodeResult {
    const clipped = fitString(path, Math.max(2, Math.min(128, allowance - 70)))
    return bounded({ kind, reason, path: clipped.value }, allowance, kind === 'truncated' || clipped.truncated)
  }

  /** Append children incrementally; reserve truncation metadata before accepting each child. */
  function composite(
    value: Exclude<PreviewValue, null | boolean | number | string>,
    children: Iterable<{ key?: string, value: unknown, second?: unknown, pair?: boolean }>,
    path: string,
    depth: number,
    allowance: number,
  ): NodeResult {
    if (!('entries' in value) && !('values' in value))
      return bounded(value, allowance)
    const output = ('entries' in value ? value.entries : value.values) as (PreviewValue | [string, PreviewValue] | [PreviewValue, PreviewValue])[]
    let used = jsonBytes(value)
    if (used + 17 > allowance)
      return marker('truncated', 'bytes', path, allowance)
    let truncated = false
    let index = 0
    for (const child of children) {
      if (entries >= maxEntries || used + 17 + 8 > allowance) {
        truncated = true
        break
      }
      entries++
      const comma = index ? 1 : 0
      const key = child.key === undefined ? undefined : fitString(child.key, Math.min(maxString, allowance - used - 17 - 8))
      const overhead = child.pair ? 3 : key ? jsonBytes(key.value) + 3 : 0
      const available = allowance - used - 17 - comma - overhead
      if (available < (child.pair ? 8 : 4)) {
        truncated = true
        break
      }
      const currentPath = childPath(childPath(path, 'entries' in value ? 'entries' : 'values'), index)
      const firstPath = child.pair ? childPath(currentPath, 0) : key ? childPath(currentPath, 1) : currentPath
      const first = visit(child.value, firstPath, depth + 1, available - (child.pair ? 4 : 0))
      let row: PreviewValue | [string, PreviewValue] | [PreviewValue, PreviewValue] = key ? [key.value, first.value] : first.value
      if (child.pair) {
        const second = visit(child.second, childPath(currentPath, 1), depth + 1, available - first.bytes)
        row = [first.value, second.value]
        truncated ||= second.truncated
      }
      output.push(row)
      used += jsonBytes(row) + comma
      truncated ||= first.truncated || !!key?.truncated
      index++
    }
    if (truncated)
      Object.assign(value, { truncated: true })
    return bounded(value, allowance, truncated)
  }

  /** Iterate arrays by descriptors so sparse entries and accessor indices remain safe. */
  function* arrayChildren(source: unknown[]): Iterable<{ value: unknown }> {
    const length = dataProperty(source, 'length') as number
    for (let index = 0; index < length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(source, index)
      yield { value: descriptor && !('value' in descriptor) ? accessor : descriptor?.value }
    }
  }

  /** Yield own enumerable descriptors; descriptor failures remain local to the affected entry. */
  function* objectChildren(source: object): Iterable<{ key: string, value: unknown }> {
    for (const key of ownKeys(source)) {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(source, key)
        yield { key, value: descriptor && 'value' in descriptor ? descriptor.value : accessor }
      }
      catch { yield { key, value: inaccessible } }
    }
  }

  /** Visit a bounded node; all source reflection/native brand failures become explicit markers. */
  function visit(source: unknown, path: string, depth: number, allowance: number): NodeResult {
    try {
      if (source === accessor)
        return marker('accessor', 'getter not invoked', path, allowance)
      if (source === inaccessible)
        return marker('unsupported', 'reflection failed', path, allowance)
      const value = options.unwrap ? options.unwrap(source) : source
      if (value === null || typeof value === 'boolean')
        return bounded(value, allowance)
      if (typeof value === 'number')
        return Number.isFinite(value) ? bounded(value, allowance) : marker('unsupported', 'nonfinite number', path, allowance)
      if (typeof value === 'string') {
        const clipped = fitString(value, Math.min(maxString, allowance))
        return bounded(clipped.value, allowance, clipped.truncated)
      }
      if (typeof value === 'bigint') {
        // Decimal conversion is inherently allocating; string output is still strictly bounded.
        const clipped = fitString(String(value), Math.min(maxString, allowance - 28))
        return bounded({ kind: 'bigint', value: clipped.value }, allowance, clipped.truncated)
      }
      if (typeof value === 'function') {
        const name = dataProperty(value, 'name')
        const clipped = fitString(`[Function ${typeof name === 'string' ? name.slice(0, 128) : ''}]`, Math.min(maxString, allowance - 30))
        return bounded({ kind: 'function', value: clipped.value }, allowance, clipped.truncated)
      }
      if (typeof value !== 'object')
        return marker('unsupported', typeof value, path, allowance)
      const prior = seen.get(value)
      if (prior)
        return bounded({ kind: 'reference', path: fitString(prior, Math.max(2, allowance - 32)).value }, allowance)
      if (depth > maxDepth)
        return marker('truncated', 'depth', path, allowance)
      seen.set(value, path)
      if (value instanceof Date) {
        const time = Date.prototype.getTime.call(value)
        return bounded({ kind: 'date', value: Number.isFinite(time) ? Date.prototype.toISOString.call(value) : null }, allowance)
      }
      if (value instanceof Map) {
        const children = (function* () {
          for (const [key, item] of Map.prototype.entries.call(value))
            yield { value: key, second: item, pair: true }
        })()
        return composite({ kind: 'map', entries: [] }, children, path, depth, allowance)
      }
      if (value instanceof Set) {
        const children = (function* () {
          for (const item of Set.prototype.values.call(value))
            yield { value: item }
        })()
        return composite({ kind: 'set', values: [] }, children, path, depth, allowance)
      }
      if (value instanceof Error) {
        const name = dataProperty(value, 'name')
        const message = dataProperty(value, 'message')
        const safeName = fitString(typeof name === 'string' ? name : 'Error', 128)
        const safeMessage = fitString(typeof message === 'string' ? message : '', Math.min(maxString, Math.floor(allowance / 2)))
        const result = composite({ kind: 'error', name: safeName.value, message: safeMessage.value, entries: [] }, objectChildren(value), path, depth, allowance)
        if (safeName.truncated || safeMessage.truncated) {
          result.truncated = true
          if (typeof result.value === 'object' && result.value !== null && 'entries' in result.value)
            Object.assign(result.value, { truncated: true })
          result.bytes = jsonBytes(result.value)
        }
        return result
      }
      return Array.isArray(value)
        ? composite({ kind: 'array', values: [] }, arrayChildren(value), path, depth, allowance)
        : composite({ kind: 'object', entries: [] }, objectChildren(value), path, depth, allowance)
    }
    catch {
      return marker('unsupported', 'reflection failed', path, allowance)
    }
  }

  const result = visit(input, '$', 0, maxBytes)
  options.budget?.consume(result.bytes)
  return result
}
