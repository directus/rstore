import type { PreviewValue } from '../protocol/preview'
import { ProjectionBudgetExceededError } from './errors'

/** Mutable shared allowance for a complete reply; callers reserve their envelope separately. */
export interface ProjectionBudget {
  /** Remaining UTF-8 bytes. */
  readonly remainingBytes: number
  /** UTF-8 bytes consumed by detached previews. */
  readonly consumedBytes: number
  /** Charge a completed projection once. */
  consume: (bytes: number) => void
}

/** Create a shared allowance without retaining any inspected values. */
export function createProjectionBudget(maxBytes = 512 * 1024): ProjectionBudget {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 4)
    throw new RangeError('Projection byte budget must be an integer of at least 4')
  let consumed = 0
  return {
    get remainingBytes() { return maxBytes - consumed },
    get consumedBytes() { return consumed },
    consume(bytes) {
      if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > maxBytes - consumed)
        throw new ProjectionBudgetExceededError()
      consumed += bytes
    },
  }
}

/** Measure only bounded, newly created DTOs; never stringify inspected source objects. */
export function jsonBytes(value: PreviewValue | [string, PreviewValue] | [PreviewValue, PreviewValue]): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

/** Fit strings incrementally, accounting JSON escaping and complete UTF-8 code points. */
export function fitString(value: string, limit: number): { value: string, truncated: boolean } {
  let result = ''
  let bytes = 2
  for (const character of value) {
    const size = jsonBytes(character) - 2
    if (bytes + size > limit)
      return { value: result, truncated: true }
    result += character
    bytes += size
  }
  return { value: result, truncated: false }
}
