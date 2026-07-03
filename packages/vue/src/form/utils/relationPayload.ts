import { isPublicKey, pickNonSpecialProps } from '@rstore/shared'
import { klona } from 'klona'
import { reactive } from 'vue'

/** Public payload stored directly on a relation form field. */
export type RelationPayloadValue = Record<string, any> | any[]

/** Options controlling relation payload extraction. */
interface PickRelationPayloadOptions {
  /** Return a detached copy of the picked payload. */
  clone?: boolean
  /** Treat assigned arrays, including empty arrays, as submitted payload. */
  force?: boolean
}

/**
 * Return whether a value can carry relation payload properties.
 */
function isRelationPayloadObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Pick user-owned payload from a relation field value.
 */
export function pickRelationPayload(value: unknown, options: PickRelationPayloadOptions = {}): RelationPayloadValue | undefined {
  const { clone = false, force = false } = options

  if (Array.isArray(value)) {
    if (!force && !hasRelationMethods(value))
      return undefined
    return clone ? klona(value) : [...value]
  }

  if (!isRelationPayloadObject(value))
    return undefined
  if (!force && !hasRelationMethods(value))
    return undefined

  const payload = pickNonSpecialProps(value, clone)
  return Object.keys(payload).length > 0 ? payload : undefined
}

/**
 * Return the live reactive field when it currently carries user payload.
 */
export function getRelationPayloadField(value: unknown): RelationPayloadValue | undefined {
  if (Array.isArray(value))
    return hasRelationMethods(value) ? value : undefined
  if (!isRelationPayloadObject(value) || !hasRelationMethods(value) || !hasPublicPayloadKeys(value))
    return undefined
  return value
}

/**
 * Create the reactive form field that stores submitted relation payload.
 */
export function createRelationPayloadField(api: Record<string, any>, payload?: unknown): Record<string, any> | any[] {
  const field = reactive(Array.isArray(payload) ? [] : {}) as Record<string, any> | any[]
  attachRelationMethods(field, api)
  copyRelationPayload(field, payload)
  return field
}

/**
 * Attach non-enumerable rstore relation methods to a relation payload field.
 */
function attachRelationMethods(target: Record<string, any> | any[], api: Record<string, any>): void {
  Object.defineProperties(target, Object.getOwnPropertyDescriptors(api))
}

/**
 * Return the empty relation cache data backing a relation field.
 */
export function getInitialRelationData(relation: any) {
  return relation.many ? [] : null
}

/**
 * Copy public relation payload into a freshly created reactive field.
 */
function copyRelationPayload(target: Record<string, any> | any[], payload: unknown): void {
  const nextPayload = pickRelationPayload(payload, { force: true })
  if (!nextPayload)
    return

  if (Array.isArray(target) && Array.isArray(nextPayload)) {
    target.push(...nextPayload)
  }
  else if (!Array.isArray(target) && !Array.isArray(nextPayload)) {
    Object.assign(target, nextPayload)
  }
}

/**
 * Return whether a value already carries the relation API.
 */
function hasRelationMethods(value: unknown): boolean {
  return !!value && typeof value === 'object' && '$connect' in value
}

/**
 * Return whether a relation object has enumerable user payload keys.
 */
function hasPublicPayloadKeys(value: Record<string, any>): boolean {
  for (const key in value) {
    if (isPublicKey(key))
      return true
  }
  return false
}
