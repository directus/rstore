import type { HistoryEntry, HistoryPage } from '../protocol'
import { projectValue } from '../projection'

/** A hook event before live values cross projection boundary. */
export interface HistoryInput extends Omit<HistoryEntry, 'sequence' | 'time' | 'arguments' | 'result' | 'error'> {
  /** Optional explicit observation timestamp. */
  time?: number
  /** Arguments detach immediately. */
  arguments?: unknown
  /** Results detach immediately. */
  result?: unknown
  /** Failures detach immediately. */
  error?: unknown
}
/** Independent retained evidence buffer. */
export interface History {
  /** Current encoded event byte cost. */
  readonly bytes: number
  /** Record bounded detached event. */
  record: (event: HistoryInput) => void
  /** Retrieve detached ordered page, newest entries when no cursor. */
  page: (options?: { limit?: number, beforeSequence?: number, afterSequence?: number, maxBytes?: number }) => HistoryPage
  /** Clear retained entries without resetting sequence. */
  clear: () => void
}
/** Configure one registration history. */
export interface HistoryOptions {
  /** Maximum retained entries. */
  limit?: number
  /** Maximum retained encoded bytes. */
  maxBytes?: number
  /** Adapter unwrapping before projection. */
  unwrap?: (value: unknown) => unknown
  /** Called after each actual capture or clear. */
  onChange?: () => void
}

/** Bound event count and encoded bytes jointly; never retain application values. */
export function createHistory(options: HistoryOptions = {}): History {
  const limit = options.limit ?? 1000
  const maxBytes = options.maxBytes ?? 4 * 1024 * 1024
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 128)
    throw new RangeError('History limits must be positive integers; bytes must be at least 128')
  const entries: Array<{ entry: HistoryEntry, bytes: number }> = []
  let bytes = 0
  let sequence = 0
  let droppedCount = 0

  return {
    get bytes() { return bytes },
    record(event) {
      const { arguments: args, result, error, ...metadata } = event
      const entry: HistoryEntry = { ...metadata, sequence: ++sequence, time: event.time ?? Date.now() }
      // Reserve event metadata. Each inspected value has its own bounded preview.
      const allowance = Math.max(4, Math.min(32 * 1024, Math.floor((maxBytes - 128) / 3)))
      for (const [key, value] of [['arguments', args], ['result', result], ['error', error]] as const) {
        if (value !== undefined) {
          const projection = projectValue(value, { unwrap: options.unwrap, maxBytes: allowance })
          entry[key] = projection.value
          if (projection.truncated)
            entry.truncated = true
        }
      }
      const size = new TextEncoder().encode(JSON.stringify(entry)).length
      if (size <= maxBytes) {
        entries.push({ entry, bytes: size })
        bytes += size
      }
      else {
        droppedCount++
      }
      while (entries.length > limit || bytes > maxBytes) {
        bytes -= entries.shift()!.bytes
        droppedCount++
      }
      try {
        options.onChange?.()
      }
      catch { /* Observers must never affect application operation outcomes. */ }
    },
    page({ limit = 100, beforeSequence, afterSequence, maxBytes = 448 * 1024 }: NonNullable<Parameters<History['page']>[0]> = {}) {
      const matching = entries.filter(({ entry }) =>
        (beforeSequence === undefined || entry.sequence < beforeSequence)
        && (afterSequence === undefined || entry.sequence > afterSequence))
      const selected = afterSequence === undefined ? matching.slice(-limit) : matching.slice(0, limit)
      const selectedCount = selected.length
      let selectedBytes = selected.reduce((total, item) => total + item.bytes, 0)
      while (selected.length && selectedBytes > maxBytes) {
        const removed = afterSequence === undefined ? selected.shift()! : selected.pop()!
        selectedBytes -= removed.bytes
      }
      return {
        entries: JSON.parse(JSON.stringify(selected.map(({ entry }) => entry))),
        droppedCount,
        oldestSequence: entries[0]?.entry.sequence,
        nextSequence: sequence + 1,
        truncated: selected.length < selectedCount || selected.some(({ entry }) => entry.truncated) ? true : undefined,
      }
    },
    clear() {
      entries.length = 0
      bytes = 0
      try {
        options.onChange?.()
      }
      catch { /* Diagnostic listener faults have no application authority. */ }
    },
  }
}
