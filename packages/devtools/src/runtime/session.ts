import type { JsonValue, SessionRequest } from '../protocol'
import type { RuntimeOptions } from './types'
import * as v from 'valibot'
import { canonicalJson } from '../actions/validation'
import { DevtoolsError, isBoundedJson, SessionRequestSchema } from '../protocol'

/** Own validated encoded request metadata; never retain request objects/getters. */
export function encodeSessionRequest(options: RuntimeOptions): string | undefined {
  if (options.kind !== 'ssr' || options.request === undefined)
    return undefined
  try {
    const source = options.request
    const keys = Reflect.ownKeys(source)
    if (keys.length > 8)
      throw new Error('Unexpected request fields')
    const detached: Record<string, JsonValue> = Object.create(null)
    for (const key of keys) {
      if (typeof key !== 'string')
        throw new Error('Unexpected request fields')
      const descriptor = Object.getOwnPropertyDescriptor(source, key)
      if (!descriptor || !('value' in descriptor))
        throw new Error('Unsafe request field')
      if (descriptor.value !== undefined)
        detached[key] = descriptor.value
    }
    if (!isBoundedJson(detached, { maxBytes: 64 * 1024, maxDepth: 64, maxEntries: 8000 }))
      throw new Error('Request metadata exceeds limits')
    const request = v.parse(SessionRequestSchema, JSON.parse(canonicalJson(detached)))
    return JSON.stringify(request)
  }
  catch {
    throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: 'Invalid SSR request metadata' })
  }
}

/** Each discovery consumer receives its own detached metadata values. */
export function decodeSessionRequest(encoded: string | undefined): SessionRequest | undefined {
  return encoded === undefined ? undefined : JSON.parse(encoded)
}
