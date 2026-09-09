import type { FilterNotStartingWith, FilterStartsWith, Path, PathValue } from '../types'
import { klona } from 'klona'

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

/**
 * Path segments that reach a prototype instead of an own property. Field paths
 * come from user data (mutation payloads, form fields), so a write through one
 * of these must not escape the target object.
 */
const prototypeReachingSegments = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Write a property without going through an inherited setter.
 *
 * A plain `current.__proto__ = {}` mutates the prototype chain rather than
 * creating a property, which is what let a crafted field path reach
 * `Object.prototype`. Defining the property keeps the write on the object.
 */
function setOwnProperty(target: any, key: string, value: unknown): void {
  if (prototypeReachingSegments.has(key)) {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    })
    return
  }
  target[key] = value
}

/**
 * Read a property for path traversal, ignoring anything inherited so a path
 * can only ever descend into the object it was given.
 */
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

/** Pick application fields, optionally detaching their nested values. */
export function pickNonSpecialProps<TItem extends Record<string, any>>(item: TItem, clone = false): Pick<TItem, FilterNotStartingWith<keyof TItem, '$' | '_$'>> {
  return pickProps(item, clone, isPublicKey)
}

/** Pick dollar-prefixed metadata, optionally detaching its nested values. */
export function pickSpecialProps<TItem extends Record<string, any>>(item: TItem, clone = false): Pick<TItem, FilterStartsWith<keyof TItem, '$'>> {
  return pickProps(item, clone, key => key.startsWith('$'))
}

/** Restore enumeration mode even when a getter or nested clone throws. */
function pickProps(item: Record<string, any>, clone: boolean, accept: (key: string) => boolean) {
  // Restore the previous value instead of clearing the flag: a pick can run
  // inside another one (a getter that clones a related item), and clearing it
  // would expose computed properties and relations to the outer pick.
  const wasCloning = cloneInfo.cloning
  cloneInfo.cloning = true
  try {
    const result: any = {}
    for (const key in item) {
      if (accept(key)) {
        result[key] = clone ? klona(item[key]) : item[key]
      }
    }
    return result
  }
  finally {
    cloneInfo.cloning = wasCloning
  }
}
