import type { ProtocolError } from '../protocol'
import type { ChannelResult } from './protocol'
import { DevtoolsError } from '../protocol'

/** Deadline never retries work: an action may settle after its caller loses certainty. */
export async function channelDeadline<T>(work: Promise<T>, milliseconds: number, action = false): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DevtoolsError({
        code: action ? 'UNKNOWN_OUTCOME' : 'UNAVAILABLE',
        message: action ? 'Action deadline exceeded; outcome unknown' : 'Inspection deadline exceeded',
        ...(action ? { outcome: 'unknown' as const } : {}),
      })), milliseconds)
    })])
  }
  finally {
    if (timer !== undefined)
      clearTimeout(timer)
  }
}

/** Preserve protocol errors; unexpected failures receive a bounded non-stack message. */
export function channelError(error: unknown): ProtocolError {
  return error instanceof DevtoolsError
    ? error.details
    : { code: 'BACKEND_FAILURE', message: error instanceof Error ? error.message.slice(0, 8192) : 'Inspection failed' }
}

/** Sanitize detached DTO optionals, validate total wire bytes, and preserve structured failures. */
export async function channelResult<T>(work: () => T | Promise<T>, action = false): Promise<ChannelResult<T>> {
  try {
    const value = await channelDeadline(Promise.resolve().then(work), action ? 30000 : 10000, action)
    const encoded = JSON.stringify({ ok: true, value })
    if (new TextEncoder().encode(encoded).byteLength > 512 * 1024)
      throw new DevtoolsError({ code: 'CAPACITY', message: 'Inspection reply exceeds transport byte budget' })
    return JSON.parse(encoded) as ChannelResult<T>
  }
  catch (error) { return { ok: false, error: channelError(error) } }
}
