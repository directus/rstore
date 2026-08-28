import type { FilterNotStartingWith, FilterStartsWith, Path, PathValue } from '../types'

export function get<TObject, TPath extends Path<TObject>>(obj: TObject, path: TPath): PathValue<TObject, TPath> | undefined {
  let current: any = obj
  for (const key of path.split('.')) {
    if (current == null) {
      return undefined
    }
    current = current[key]
  }
  return current
}

/** Path segments that can otherwise reach a prototype. */
const prototypeReachingSegments = new Set(['__proto__', 'constructor', 'prototype'])

/** Write a property without using an inherited setter. */
function setOwnProperty(target: any, key: string, value: unknown): void {
  if (prototypeReachingSegments.has(key)) {
    Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true })
    return
  }
  target[key] = value
}

/** Read only own properties while traversing a user-controlled path. */
function getOwnForTraversal(target: any, key: string): any {
  return Object.prototype.hasOwnProperty.call(target, key) ? target[key] : undefined
}

export function set<TObject, TPath extends Path<TObject>>(obj: TObject, path: TPath, value: PathValue<TObject, TPath>): void {
  let current: any = obj
  const keys = path.split('.')
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (key == null)
      continue
    if (getOwnForTraversal(current, key) == null) {
      setOwnProperty(current, key, {})
    }
    current = current[key]
  }
  setOwnProperty(current, keys.at(-1)!, value)
}

/** Return whether a property key is part of the public item/form data surface. */
export function isPublicKey(key: PropertyKey): boolean {
  return typeof key !== 'string' || (!key.startsWith('$') && !key.startsWith('_$'))
}

/** Enumeration mode shared with wrapped items while picking stored fields. */
export const cloneInfo = {
  /** Whether wrapped items should hide computed properties and relations. */
  cloning: false,
}

export function pickNonSpecialProps<TItem extends Record<string, any>>(item: TItem, clone = false): Pick<TItem, FilterNotStartingWith<keyof TItem, '$' | '_$'>> {
  return pickProps(item, clone, isPublicKey)
}

/** Pick dollar-prefixed metadata, optionally detaching its nested values. */
export function pickSpecialProps<TItem extends Record<string, any>>(item: TItem, clone = false): Pick<TItem, FilterStartsWith<keyof TItem, '$'>> {
  return pickProps(item, clone, key => key.startsWith('$'))
}

/** Restore enumeration mode even when a getter or nested clone throws. */
function pickProps(item: Record<string, any>, clone: boolean, accept: (key: string) => boolean) {
  const wasCloning = cloneInfo.cloning
  cloneInfo.cloning = true
  try {
    const result: any = {}
    for (const key in item) {
      if (accept(key)) {
        const value = item[key]
        result[key] = clone && value !== null && typeof value === 'object' ? clonePayloadValue(value) : value
      }
    }
    return result
  }
  finally {
    cloneInfo.cloning = wasCloning
  }
}

/** Clone one cache payload value with the historical `klona` data semantics. */
function clonePayloadValue<T>(value: T): T {
  if (value === null || typeof value !== 'object')
    return value
  const tag = Object.prototype.toString.call(value)
  if (tag === '[object Array]')
    return cloneArray(value as unknown as any[]) as T
  if (tag === '[object Object]')
    return cloneObject(value as Record<PropertyKey, any>) as T
  if (tag === '[object Set]')
    return cloneSet(value as unknown as Set<any>) as T
  if (tag === '[object Map]')
    return cloneMap(value as unknown as Map<any, any>) as T
  if (tag === '[object Date]')
    return new Date(Number(value)) as T
  if (tag === '[object RegExp]') {
    const source = value as unknown as RegExp
    const result = new RegExp(source.source, source.flags)
    result.lastIndex = source.lastIndex
    return result as T
  }
  if (tag === '[object DataView]') {
    const source = value as unknown as DataView
    return new DataView(clonePayloadValue(source.buffer)) as T
  }
  if (tag === '[object ArrayBuffer]')
    return (value as unknown as ArrayBuffer).slice(0) as T
  if (tag.endsWith('Array]')) {
    const source = value as unknown as { constructor: new (value: any) => unknown }
    return new source.constructor(value) as T
  }
  return value
}

/** Clone one array without callback and iterator allocations. */
function cloneArray(source: any[]): any[] {
  const result: any[] = []
  result.length = source.length
  for (let index = source.length - 1; index >= 0; index--)
    result[index] = clonePayloadValue(source[index])
  return result
}

/** Clone one ordinary or custom object through enumerable string fields. */
function cloneObject(source: Record<PropertyKey, any>): Record<PropertyKey, any> {
  const Constructor = source.constructor
  const custom = Constructor !== Object && typeof Constructor === 'function'
  const result = custom ? new (Constructor as new () => Record<PropertyKey, any>)() : {}
  const hasOwnProperty = Object.prototype.hasOwnProperty
  for (const key in source) {
    if (!custom) {
      assignClonedProperty(result, key, source[key])
    }
    else if (hasOwnProperty.call(source, key) && result[key] !== source[key]) {
      result[key] = clonePayloadValue(source[key])
    }
  }
  return result
}

/** Assign a cloned enumerable field without invoking `__proto__` mutation. */
function assignClonedProperty(target: Record<PropertyKey, any>, key: string, value: any): void {
  const cloned = clonePayloadValue(value)
  if (key === '__proto__') {
    Object.defineProperty(target, key, {
      value: cloned,
      configurable: true,
      enumerable: true,
      writable: true,
    })
  }
  else {
    target[key] = cloned
  }
}

/** Clone Set values while preserving insertion order. */
function cloneSet(source: Set<any>): Set<any> {
  const result = new Set<any>()
  for (const value of source)
    result.add(clonePayloadValue(value))
  return result
}

/** Clone Map keys and values while preserving insertion order. */
function cloneMap(source: Map<any, any>): Map<any, any> {
  const result = new Map<any, any>()
  for (const [key, value] of source)
    result.set(clonePayloadValue(key), clonePayloadValue(value))
  return result
}
